import { spawn as nodeSpawn } from 'node:child_process'
import { constants, setPriority } from 'node:os'
import type { ChildProcess, SpawnOptions } from 'node:child_process'

export class FfmpegError extends Error {
  readonly code: number | null
  readonly stderrTail: string

  constructor(message: string, code: number | null, stderrTail: string) {
    super(message)
    this.name = 'FfmpegError'
    this.code = code
    this.stderrTail = stderrTail
  }
}

export interface RunFfmpegOptions {
  binary?: string
  timeoutMs?: number
  lowPriority?: boolean
  spawnFn?: (command: string, args: string[], options: SpawnOptions) => ChildProcess
  setPriorityFn?: (pid: number, priority: number) => void
}

const STDERR_TAIL_BYTES = 4_000

// Lance ffmpeg en priorite basse (equivalent de `nice` : PRIORITY_LOW sur Linux, classe "idle" sur Windows)
// pour ne pas ralentir le site Nuxt qui partage le CPU. Les arguments (preset, threads) sont choisis par l'appelant.
export function runFfmpeg(args: string[], options: RunFfmpegOptions = {}): Promise<void> {
  const spawnFn = options.spawnFn ?? nodeSpawn
  const applyPriority = options.setPriorityFn ?? setPriority
  const timeoutMs = options.timeoutMs ?? 15 * 60_000

  return new Promise((resolve, reject) => {
    const child = spawnFn(options.binary ?? 'ffmpeg', ['-nostdin', '-hide_banner', '-y', ...args], {
      stdio: ['ignore', 'ignore', 'pipe']
    })

    if (options.lowPriority !== false && child.pid) {
      try {
        applyPriority(child.pid, constants.priority.PRIORITY_LOW)
      } catch {
        // Priorite non modifiable (droits, plateforme) : le rendu continue a priorite normale.
      }
    }

    let tail = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      tail = (tail + chunk.toString()).slice(-STDERR_TAIL_BYTES)
    })

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new FfmpegError(`ffmpeg introuvable ou non lancable : ${error.message}`, null, tail))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) return reject(new FfmpegError(`ffmpeg interrompu apres ${timeoutMs} ms`, code, tail))
      if (code === 0) return resolve()
      reject(new FfmpegError(`ffmpeg a echoue (code ${code}) : ${tail.trim().split('\n').slice(-3).join(' | ')}`, code, tail))
    })
  })
}
