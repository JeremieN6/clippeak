import { spawn as nodeSpawn } from 'node:child_process'
import { constants, setPriority } from 'node:os'
import { resolve } from 'node:path'
import type { ChildProcess, SpawnOptions } from 'node:child_process'

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

export interface TranscriptResult {
  segments: TranscriptSegment[]
  audioSec: number
  transcribeSec: number
}

export class WhisperError extends Error {
  readonly code: number | null

  constructor(message: string, code: number | null) {
    super(message)
    this.name = 'WhisperError'
    this.code = code
  }
}

export interface WhisperOptions {
  python?: string
  script?: string
  model?: string
  timeoutMs?: number
  spawnFn?: (command: string, args: string[], options: SpawnOptions) => ChildProcess
  setPriorityFn?: (pid: number, priority: number) => void
}

export function parseWhisperOutput(stdout: string): TranscriptResult {
  const line = stdout.split(/\r?\n/).reverse().find(l => l.trim().startsWith('{'))
  if (!line) throw new WhisperError('Sortie de transcription illisible', null)
  let data: any
  try {
    data = JSON.parse(line)
  } catch {
    throw new WhisperError('Sortie de transcription illisible', null)
  }
  if (!Array.isArray(data.segments)) throw new WhisperError('Sortie de transcription sans segments', null)
  return {
    segments: data.segments.map((s: any) => ({ start: Number(s.start), end: Number(s.end), text: String(s.text ?? '').trim() })),
    audioSec: Number(data.audio_s ?? 0),
    transcribeSec: Number(data.transcribe_s ?? 0)
  }
}

// Whisper tourne en local (faster-whisper, CPU) dans un process Python a priorite basse : le serveur Nuxt
// partage le CPU. Reglages : WHISPER_PYTHON, WHISPER_MODEL (small par defaut), WHISPER_SCRIPT.
export function transcribeWav(wavPath: string, options: WhisperOptions = {}): Promise<TranscriptResult> {
  const spawnFn = options.spawnFn ?? nodeSpawn
  const applyPriority = options.setPriorityFn ?? setPriority
  const python = options.python ?? process.env.WHISPER_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3')
  const script = options.script ?? process.env.WHISPER_SCRIPT ?? resolve(process.cwd(), 'scripts/whisper/transcribe.py')
  const model = options.model ?? process.env.WHISPER_MODEL ?? 'small'
  const timeoutMs = options.timeoutMs ?? 10 * 60_000

  return new Promise((resolvePromise, reject) => {
    const child = spawnFn(python, [script, wavPath, model], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUTF8: '1', HF_HUB_DISABLE_SYMLINKS_WARNING: '1' }
    })
    if (child.pid) {
      try { applyPriority(child.pid, constants.priority.PRIORITY_LOW) } catch { /* priorite non modifiable */ }
    }

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4_000) })

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new WhisperError(`Python introuvable ou non lancable (${python}) : ${error.message}`, null))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) return reject(new WhisperError(`Transcription interrompue apres ${timeoutMs} ms`, code))
      if (code !== 0) {
        return reject(new WhisperError(`Transcription en echec (code ${code}) : ${stderr.trim().split('\n').slice(-2).join(' | ')}`, code))
      }
      try {
        resolvePromise(parseWhisperOutput(stdout))
      } catch (error) {
        reject(error)
      }
    })
  })
}
