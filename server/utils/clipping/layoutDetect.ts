import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sampleTimes } from './framingDetect.ts'

// Rectangle normalise (0..1) par la taille de l'image source.
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface LayoutFace extends Rect {
  score: number
  // Seulement si des photos du streamer ont ete fournies.
  similarity?: number
  // Rectangle net (camera incrustee ou panneau camera) qui entoure ce visage, s'il y en a un.
  rect?: Rect
}

export interface LayoutFrame {
  t: number
  faces: LayoutFace[]
}

// Disposition d'un clip dont l'ecran est partage : la camera du streamer d'un cote, ce qu'il lit ou regarde de l'autre.
//   pip   : petite camera incrustee dans l'ecran de contenu (le contenu est l'image entiere)
//   panel : panneau camera pleine hauteur a cote du contenu (le contenu est l'autre moitie)
export interface ClipLayout {
  kind: 'pip' | 'panel'
  cam: Rect
  content: Rect
  // Hauteur du visage dans la camera (0 = haut, 1 = bas) : le recadrage de la camera le garde dans l'image.
  camFocusY: number
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
const round = (n: number) => Math.round(n * 1000) / 1000

export interface ClassifyOptions {
  // Des photos du streamer ont ete fournies : on ne retient que le visage reconnu. Sinon, tout visage entoure d'un rectangle net.
  recognized: boolean
  threshold?: number
  // Part minimale des images ou la camera doit etre retrouvee, et ecart maximal de son rectangle d'une image a l'autre.
  minShare?: number
  maxSpread?: number
}

// Decide si le clip a un ecran partage a partir de quelques images. Une camera incrustee reste a la meme place pendant tout le
// clip : il faut la retrouver dans la plupart des images, au meme endroit. Un rectangle qui apparait de temps en temps (objet de
// la piece, fenetre de video) n'est pas une camera : le clip reste en plein cadre.
export function classifyLayout(frames: LayoutFrame[], options: ClassifyOptions): ClipLayout | null {
  if (!frames.length) return null
  const threshold = options.threshold ?? 0.363
  const maxSpread = options.maxSpread ?? 0.06
  const hits: Array<{ rect: Rect, face: LayoutFace }> = []
  for (const frame of frames) {
    const candidates = options.recognized
      ? frame.faces.filter(f => (f.similarity ?? 0) >= threshold).sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
      : frame.faces.filter(f => f.rect).sort((a, b) => a.h - b.h)
    const best = candidates[0]
    if (best?.rect) hits.push({ rect: best.rect, face: best })
  }
  const needed = Math.max(2, Math.ceil(frames.length * (options.minShare ?? 0.6)))
  if (hits.length < needed) return null

  const centre = { x: median(hits.map(h => h.rect.x)), y: median(hits.map(h => h.rect.y)), w: median(hits.map(h => h.rect.w)), h: median(hits.map(h => h.rect.h)) }
  const stable = hits.filter(h => Math.abs(h.rect.x - centre.x) <= maxSpread && Math.abs(h.rect.y - centre.y) <= maxSpread
    && Math.abs(h.rect.w - centre.w) <= maxSpread && Math.abs(h.rect.h - centre.h) <= maxSpread)
  if (stable.length < needed) return null

  const cam: Rect = { x: round(centre.x), y: round(centre.y), w: round(centre.w), h: round(centre.h) }
  const faceY = median(stable.map(h => h.face.y + h.face.h / 2))
  const camFocusY = Math.min(1, Math.max(0, (faceY - cam.y) / cam.h))

  if (cam.h >= 0.9) {
    // Panneau pleine hauteur : le contenu est le plus grand cote restant.
    const left: Rect = { x: 0, y: 0, w: cam.x, h: 1 }
    const right: Rect = { x: cam.x + cam.w, y: 0, w: 1 - cam.x - cam.w, h: 1 }
    const content = left.w >= right.w ? left : right
    if (content.w < 0.25) return null
    return { kind: 'panel', cam, content: { x: round(content.x), y: 0, w: round(content.w), h: 1 }, camFocusY: round(camFocusY) }
  }
  return { kind: 'pip', cam, content: { x: 0, y: 0, w: 1, h: 1 }, camFocusY: round(camFocusY) }
}

export interface DetectLayoutDeps {
  extractFrame: (videoUrl: string, timeSec: number, outPath: string) => Promise<void>
  analyse: (request: { models: string, frames: Array<{ path: string, t: number }>, photos?: string[] }) => Promise<{ frames: LayoutFrame[] }>
  modelsDir: string
  workDir?: () => Promise<string>
  cleanup?: (dir: string) => Promise<void>
}

export interface DetectLayoutInput {
  videoUrl: string
  startSec: number
  endSec: number
  photos?: string[]
  frames?: number
}

// Prend quelques images du clip et en deduit si l'ecran est partage (camera incrustee ou panneau camera).
export async function detectLayout(input: DetectLayoutInput, deps: DetectLayoutDeps): Promise<ClipLayout | null> {
  const dir = await (deps.workDir ?? (() => mkdtemp(join(tmpdir(), 'clippeak-layout-'))))()
  try {
    const times = sampleTimes(input.startSec, input.endSec, input.frames ?? 6)
    const frames: Array<{ path: string, t: number }> = []
    for (const [i, t] of times.entries()) {
      const path = join(dir, `l${i}.jpg`)
      await deps.extractFrame(input.videoUrl, t, path)
      frames.push({ path, t })
    }
    const photos = input.photos?.length ? input.photos : undefined
    const result = await deps.analyse({ models: deps.modelsDir, frames, ...(photos ? { photos } : {}) })
    return classifyLayout(result.frames, { recognized: Boolean(photos) })
  } finally {
    await (deps.cleanup ?? (d => rm(d, { recursive: true, force: true })))(dir)
  }
}
