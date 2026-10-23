import { spawn as nodeSpawn } from 'node:child_process'
import { constants, setPriority } from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import type { Framing } from './clipRender.ts'
import type { RunFfmpegOptions } from './ffmpegRunner.ts'

export interface FaceHit {
  found: boolean
  similarity: number
  // Boite du visage, normalisee (0..1) par la taille de l'image.
  box?: { x: number, y: number, w: number, h: number }
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits

// Cadrage a partir des images ou le streamer a ete reconnu : mediane des positions (robuste a une image aberrante),
// zoom pour que le visage occupe ~30 % de la hauteur de la video, visage place a ~40 % depuis le haut.
// Moins de `minHits` reconnaissances : on ne devine pas, le cadrage manuel reste en place.
export function framingFromHits(hits: FaceHit[], options: { minHits?: number, targetFaceShare?: number, maxZoom?: number } = {}): Framing | null {
  const found = hits.filter((h): h is FaceHit & { box: NonNullable<FaceHit['box']> } => h.found && !!h.box)
  if (found.length < (options.minHits ?? 2)) return null

  const cx = median(found.map(h => h.box.x + h.box.w / 2))
  const cy = median(found.map(h => h.box.y + h.box.h / 2))
  const faceH = median(found.map(h => h.box.h))
  const zoom = clamp((options.targetFaceShare ?? 0.30) / Math.max(faceH, 0.01), 1, options.maxZoom ?? 3)
  return {
    centerX: round(clamp(cx, 0, 1)),
    centerY: round(clamp(cy + 0.1 / zoom, 0, 1)),
    zoom: round(zoom, 1)
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
  workDir?: () => Promise<string>
  cleanup?: (dir: string) => Promise<void>
}

export interface DetectFramingInput {
  videoUrl: string
  startSec: number
  endSec: number
  photos: string[]
  frames?: number
}

// Retrouve le streamer dans quelques images du clip avec ses photos de reference et en deduit le cadrage.
// Renvoie null si les photos sont inutilisables ou si le streamer n'est pas reconnu assez souvent (clip de react
// ou il n'apparait pas, par exemple) : le rendu retombe alors sur le cadrage manuel et le signale.
export async function detectFraming(input: DetectFramingInput, deps: DetectFramingDeps): Promise<Framing | null> {
  if (!input.photos.length) return null
  const dir = await (deps.workDir ?? (() => mkdtemp(join(tmpdir(), 'clippeak-frames-'))))()
  try {
    const times = sampleTimes(input.startSec, input.endSec, input.frames ?? 5)
    const frames: Array<{ path: string, t: number }> = []
    for (const [i, t] of times.entries()) {
      const path = join(dir, `f${i}.jpg`)
      await deps.extractFrame(input.videoUrl, t, path)
      frames.push({ path, t })
    }
    const result = await deps.locate({ models: deps.modelsDir, photos: input.photos, frames })
    if (!result.photos_used) return null
    return framingFromHits(result.frames)
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
