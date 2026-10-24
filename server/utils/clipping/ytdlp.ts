import { spawn as nodeSpawn } from 'node:child_process'
import { constants, setPriority } from 'node:os'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { parseReferenceUrl } from './referenceSource.ts'

export interface YtDlpMeta {
  id: string
  title: string | null
  durationSec: number | null
  viewCount: number | null
  likeCount: number | null
  commentCount: number | null
  shareCount: number | null
}

export interface YtDlpLimits {
  maxFilesizeMb: number
  maxDurationSec: number
  maxHeight: number
}

export const DEFAULT_LIMITS: YtDlpLimits = { maxFilesizeMb: 100, maxDurationSec: 180, maxHeight: 720 }

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null)

export function parseYtDlpMeta(json: any): YtDlpMeta {
  return {
    id: String(json?.id ?? ''),
    title: typeof json?.title === 'string' ? json.title.slice(0, 255) : null,
    durationSec: num(json?.duration),
    viewCount: num(json?.view_count),
    likeCount: num(json?.like_count),
    commentCount: num(json?.comment_count),
    shareCount: num(json?.repost_count)
  }
}

// Options communes : jamais de fichier de configuration (--ignore-config), jamais de commande externe, delais courts.
// "--" avant l'adresse : elle ne peut jamais etre lue comme une option.
const COMMON = ['--ignore-config', '--no-warnings', '--no-cache-dir', '--socket-timeout', '20', '--retries', '2']

export function metadataArgs(url: string): string[] {
  return [...COMMON, '--no-playlist', '--skip-download', '--dump-single-json', '--', url]
}

export function downloadArgs(url: string, outTemplate: string, limits: YtDlpLimits = DEFAULT_LIMITS): string[] {
  return [
    ...COMMON, '--no-playlist',
    '--max-filesize', `${limits.maxFilesizeMb}M`,
    '--match-filter', `duration<=${limits.maxDurationSec}`,
    '-f', `b[height<=${limits.maxHeight}]/b`,
    '-o', outTemplate,
    '--', url
  ]
}

export function accountArgs(url: string, limit: number): string[] {
  return [...COMMON, '--flat-playlist', '--dump-single-json', '--playlist-end', String(Math.min(50, Math.max(1, limit))), '--', url]
}

// Liens de clips d'un compte, filtres par la meme liste blanche que les liens saisis.
export function parseAccountEntries(json: any, max = 50): string[] {
  const entries: any[] = Array.isArray(json?.entries) ? json.entries : []
  const urls: string[] = []
  for (const entry of entries) {
    for (const candidate of [entry?.webpage_url, entry?.url]) {
      const parsed = typeof candidate === 'string' ? parseReferenceUrl(candidate) : null
      if (parsed?.kind === 'clip' && !urls.includes(parsed.url)) {
        urls.push(parsed.url)
        break
      }
    }
    if (urls.length >= max) break
  }
  return urls
}

export interface RunYtDlpOptions {
  binary?: string
  timeoutMs?: number
  spawnFn?: (command: string, args: string[], options: SpawnOptions) => ChildProcess
  setPriorityFn?: (pid: number, priority: number) => void
}

const MAX_STDOUT = 8 * 1024 * 1024

export class YtDlpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'YtDlpError'
  }
}

export function runYtDlp(args: string[], options: RunYtDlpOptions = {}): Promise<string> {
  const spawnFn = options.spawnFn ?? nodeSpawn
  const applyPriority = options.setPriorityFn ?? setPriority
  const binary = options.binary ?? process.env.YTDLP_BIN ?? 'yt-dlp'

  return new Promise((resolve, reject) => {
    const child = spawnFn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    if (child.pid) {
      try { applyPriority(child.pid, constants.priority.PRIORITY_LOW) } catch { /* priorite non modifiable */ }
    }
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => { if (stdout.length < MAX_STDOUT) stdout += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-2_000) })
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, options.timeoutMs ?? 5 * 60_000)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new YtDlpError(`yt-dlp introuvable ou non lancable (${binary}) : ${error.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) return reject(new YtDlpError('yt-dlp interrompu (delai depasse)'))
      if (code !== 0) return reject(new YtDlpError(`yt-dlp a echoue (code ${code}) : ${stderr.trim().split('\n').slice(-2).join(' | ').slice(0, 300)}`))
      resolve(stdout)
    })
  })
}
