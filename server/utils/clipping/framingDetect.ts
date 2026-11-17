import { spawn as nodeSpawn } from 'node:child_process'
import { constants, setPriority } from 'node:os'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import type { Framing } from './clipRender.ts'
import type { RunFfmpegOptions } from './ffmpegRunner.ts'
import { planTrack } from './faceTrack.ts'

export interface FaceHit {
  found: boolean
  similarity: number
  // Boite du visage, normalisee (0..1) par la taille de l'image.
  box?: { x: number, y: number, w: number, h: number }
}

export interface Box { x: number, y: number, w: number, h: number }

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits

// Niveaux de zoom du cadrage automatique : part de la hauteur de la video que le visage doit occuper, et zoom maximal.
export type FramingZoomLevel = 'wide' | 'normal' | 'close'
export const FRAMING_ZOOM_LEVELS: Record<FramingZoomLevel, { targetFaceShare: number, maxZoom: number }> = {
  wide: { targetFaceShare: 0.16, maxZoom: 1.4 },
  normal: { targetFaceShare: 0.24, maxZoom: 2 },
  close: { targetFaceShare: 0.32, maxZoom: 2.4 }
}

export interface FramingOptions {
  minHits?: number
  targetFaceShare?: number
  maxZoom?: number
  // Largeur / hauteur de la video source (16/9 par defaut) : sert a savoir quelle largeur le recadrage 9:16 laisse a l'image.
  sourceAspect?: number
  // Force du zoom d'ouverture (0,12 = 12 %) : le premier instant du clip est plus serre, il faut garder de la marge.
  introAmount?: number
}

// Rectangle (normalise 0..1) que le recadrage 9:16 montre dans l'image source. Meme calcul que `cropRect` du rendu.
export function visibleArea(framing: Framing, sourceAspect = 16 / 9): Box {
  const zoom = Math.max(1, framing.zoom)
  const h = 1 / zoom
  const w = Math.min(1, (h * 9 / 16) / sourceAspect)
  return {
    x: Math.min(1 - w, Math.max(0, framing.centerX - w / 2)),
    y: Math.min(1 - h, Math.max(0, framing.centerY - h / 2)),
    w,
    h
  }
}

// Le recadrage montre-t-il tout le rectangle `box` ? `introAmount` : marge pour le zoom d'ouverture, qui rogne les bords au debut du clip.
export function framingShows(framing: Framing, box: Box, sourceAspect = 16 / 9, introAmount = 0): boolean {
  const area = visibleArea(framing, sourceAspect)
  const shrink = 1 + Math.max(0, introAmount)
  const mx = (area.w - area.w / shrink) / 2
  const my = (area.h - area.h / shrink) / 2
  const eps = 0.005
  return box.x >= area.x + mx - eps && box.x + box.w <= area.x + area.w - mx + eps
    && box.y >= area.y + my - eps && box.y + box.h <= area.y + area.h - my + eps
}

// Cadrage a partir des images ou le streamer a ete reconnu. On ne se fie pas a la seule position mediane (un streamer qui se penche
// sortirait du cadre) : le recadrage contient le visage ET les epaules dans TOUTES les images retenues, et le zoom est limite pour que
// cette zone tienne dans la largeur du clip (zoom d'ouverture compris). Les images aberrantes (autre personne, fausse detection) sont ecartees.
// Moins de `minHits` reconnaissances : on ne devine pas (null).
export function framingFromHits(hits: FaceHit[], options: FramingOptions = {}): Framing | null {
  const found = hits.filter((h): h is FaceHit & { box: Box } => h.found && !!h.box)
  const minHits = options.minHits ?? 2
  if (found.length < minHits) return null
  const aspect = options.sourceAspect ?? 16 / 9
  const intro = 1 + Math.max(0, options.introAmount ?? 0)

  const mx = median(found.map(h => h.box.x + h.box.w / 2))
  const my = median(found.map(h => h.box.y + h.box.h / 2))
  const kept = found.filter(h => Math.abs(h.box.x + h.box.w / 2 - mx) <= 0.2 && Math.abs(h.box.y + h.box.h / 2 - my) <= 0.25)
  const cluster = kept.length >= minHits ? kept : found

  // Zone a garder dans le cadre : le visage elargi aux epaules, avec un peu de place au-dessus et en dessous.
  const x0 = Math.min(...cluster.map(h => h.box.x - h.box.w * 0.9))
  const x1 = Math.max(...cluster.map(h => h.box.x + h.box.w * 1.9))
  const y0 = Math.min(...cluster.map(h => h.box.y - h.box.h * 0.5))
  const y1 = Math.max(...cluster.map(h => h.box.y + h.box.h * 1.5))
  const faceH = median(cluster.map(h => h.box.h))

  // Zoom voulu (visage assez grand), borne par ce qui tient dans la video 9:16 (largeur = 9/16 de la hauteur, avant le zoom d'ouverture).
  const wanted = clamp((options.targetFaceShare ?? 0.24) / Math.max(faceH, 0.01), 1, options.maxZoom ?? 2)
  const fitX = (9 / 16 / aspect) / (Math.max(x1 - x0, 0.01) * intro)
  const fitY = 1 / (Math.max(y1 - y0, 0.01) * intro)
  const zoom = Math.max(1, Math.min(wanted, fitX, fitY))
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const fx0 = clamp(x0, 0, 1)
  const fx1 = clamp(x1, 0, 1)
  const fy0 = clamp(y0, 0, 1)
  const fy1 = clamp(y1, 0, 1)
  return {
    centerX: round(clamp(cx, 0, 1)),
    centerY: round(clamp(cy + 0.1 / zoom, 0, 1)),
    zoom: round(zoom, 2),
    face: { x: round(fx0, 3), y: round(fy0, 3), w: round(fx1 - fx0, 3), h: round(fy1 - fy0, 3) }
  }
}

// Instants (en s de VOD) ou prelever les images : repartis dans le clip, hors des bords.
export function sampleTimes(startSec: number, endSec: number, count = 5): number[] {
  const margin = Math.min(1, (endSec - startSec) / 4)
  const from = startSec + margin
  const to = endSec - margin
  if (count <= 1 || to <= from) return [Math.round(((startSec + endSec) / 2) * 10) / 10]
  return Array.from({ length: count }, (_, i) => Math.round((from + ((to - from) * i) / (count - 1)) * 10) / 10)
}

export interface DetectFramingDeps {
  extractFrame: (videoUrl: string, timeSec: number, outPath: string) => Promise<void>
  locate: (request: { models: string, photos: string[], frames: Array<{ path: string, t: number }>, threshold?: number }) => Promise<{ photos_used: number, frames: Array<FaceHit & { t: number }> }>
  modelsDir: string
  // Suivi du visage : une seule passe ffmpeg qui depose des images regulieres dans `dir` (chemins renvoyes dans l'ordre, la k-ieme est a startSec + k x stepSec).
  extractSeries?: (videoUrl: string, startSec: number, durationSec: number, stepSec: number, dir: string) => Promise<string[]>
  workDir?: () => Promise<string>
  cleanup?: (dir: string) => Promise<void>
}

export interface DetectFramingInput {
  videoUrl: string
  startSec: number
  endSec: number
  photos: string[]
  frames?: number
  // Niveau de zoom choisi par le streamer, forme de la video source et zoom d'ouverture (voir FramingOptions).
  zoomLevel?: FramingZoomLevel
  sourceAspect?: number
  introAmount?: number
  // Suivre le visage pendant le clip (cadre qui glisse doucement) au lieu d'un cadre fixe.
  follow?: boolean
}

// Retrouve le streamer dans quelques images du clip avec ses photos de reference et en deduit le cadrage.
// Renvoie null si les photos sont inutilisables ou si le streamer n'est pas reconnu (clip de react ou il n'apparait pas, scene sans camera) :
// avant de conclure qu'il est absent, une seconde passe regarde davantage d'images (il a pu detourner la tete a un instant).
export async function detectFraming(input: DetectFramingInput, deps: DetectFramingDeps): Promise<Framing | null> {
  if (!input.photos.length) return null
  const options: FramingOptions = { ...FRAMING_ZOOM_LEVELS[input.zoomLevel ?? 'normal'], sourceAspect: input.sourceAspect, introAmount: input.introAmount }
  const dir = await (deps.workDir ?? (() => mkdtemp(join(tmpdir(), 'clippeak-frames-'))))()
  try {
    // Suivi : images regulieres sur tout le clip (une seule passe ffmpeg), puis trajet doux du cadre. Sans suivi possible, on retombe sur le cadre fixe.
    if (input.follow && deps.extractSeries) {
      const duration = input.endSec - input.startSec
      const step = Math.min(2.5, Math.max(1, duration / 20))
      const files = await deps.extractSeries(input.videoUrl, input.startSec, duration, step, dir)
      if (files.length >= 2) {
        const result = await deps.locate({ models: deps.modelsDir, photos: input.photos, frames: files.map((path, k) => ({ path, t: round(input.startSec + k * step, 2) })) })
        if (!result.photos_used) return null
        const plan = planTrack(result.frames, input.startSec, { ...options })
        if (plan) return { centerX: plan.centerX, centerY: plan.centerY, zoom: plan.zoom, face: plan.face, ...(plan.moves.length ? { pan: plan.moves } : {}) }
      }
    }
    const first = input.frames ?? 5
    for (const count of [first, first + 5]) {
      const times = sampleTimes(input.startSec, input.endSec, count)
      const frames: Array<{ path: string, t: number }> = []
      for (const [i, t] of times.entries()) {
        const path = join(dir, `f${count}-${i}.jpg`)
        await deps.extractFrame(input.videoUrl, t, path)
        frames.push({ path, t })
      }
      const result = await deps.locate({ models: deps.modelsDir, photos: input.photos, frames })
      if (!result.photos_used) return null
      const framing = framingFromHits(result.frames, options)
      if (framing) return framing
    }
    return null
  } finally {
    await (deps.cleanup ?? (d => rm(d, { recursive: true, force: true })))(dir)
  }
}

export interface PythonRunOptions {
  python?: string
  script?: string
  timeoutMs?: number
  spawnFn?: (command: string, args: string[], options: SpawnOptions) => ChildProcess
  setPriorityFn?: (pid: number, priority: number) => void
}

// Lance locate_streamer.py (OpenCV, CPU) a priorite basse ; la requete passe par stdin, le resultat par stdout.
export function runLocateScript(request: unknown, options: PythonRunOptions = {}): Promise<any> {
  const spawnFn = options.spawnFn ?? nodeSpawn
  const applyPriority = options.setPriorityFn ?? setPriority
  const python = options.python ?? process.env.VISION_PYTHON ?? process.env.WHISPER_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3')
  const script = options.script ?? resolve(process.cwd(), 'scripts/vision/locate_streamer.py')

  return new Promise((resolvePromise, reject) => {
    const child = spawnFn(python, [script], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONUTF8: '1' } })
    if (child.pid) {
      try { applyPriority(child.pid, constants.priority.PRIORITY_LOW) } catch { /* priorite non modifiable */ }
    }
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (c: Buffer) => { stdout += c.toString() })
    child.stderr?.on('data', (c: Buffer) => { stderr = (stderr + c.toString()).slice(-2_000) })
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs ?? 120_000)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new Error(`Reconnaissance du streamer impossible (${python}) : ${error.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const line = stdout.split(/\r?\n/).reverse().find(l => l.trim().startsWith('{'))
      if (code !== 0 || !line) return reject(new Error(`Reconnaissance du streamer en echec (code ${code}) : ${stderr.trim().split('\n').slice(-2).join(' | ')}`))
      try { resolvePromise(JSON.parse(line)) } catch { reject(new Error('Sortie de la reconnaissance illisible')) }
    })
    child.stdin?.end(JSON.stringify(request))
  })
}

export function frameExtractor(runFfmpeg: (args: string[], options?: RunFfmpegOptions) => Promise<string>) {
  return (videoUrl: string, timeSec: number, outPath: string) =>
    runFfmpeg(['-ss', String(timeSec), '-i', videoUrl, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', outPath], { timeoutMs: 60_000 }).then(() => undefined)
}

// Une seule passe ffmpeg : une image tous les `stepSec` secondes, reduites (le detecteur de visage n'a pas besoin de plus).
export function frameSeriesExtractor(runFfmpeg: (args: string[], options?: RunFfmpegOptions) => Promise<string>) {
  return async (videoUrl: string, startSec: number, durationSec: number, stepSec: number, dir: string): Promise<string[]> => {
    await runFfmpeg(['-ss', String(startSec), '-t', String(durationSec), '-i', videoUrl, '-an', '-vf', `fps=1/${stepSec},scale=960:-2`, '-q:v', '4', join(dir, 's%03d.jpg')], { timeoutMs: 180_000 })
    return (await readdir(dir)).filter(f => /^s\d+\.jpg$/.test(f)).sort().map(f => join(dir, f))
  }
}
