import { spawnSync } from 'node:child_process'
import { runFfmpeg } from './ffmpegRunner.ts'
import type { RunFfmpegOptions } from './ffmpegRunner.ts'
import { normalizeWord } from './assBuilder.ts'

export interface ClipMetrics {
  width: number
  height: number
  videoSec: number
  audioSec: number | null
  // Image figee detectee dans les dernieres secondes (debut de gel, en s depuis le debut du clip) ou null.
  freezeAtEndSec: number | null
  leadingSilenceSec: number
  trailingSilenceSec: number
}

export interface QcExpectations {
  minSec: number
  maxSec: number
  title: string
  titleMaxLines: number
  titleMaxCharsPerLine: number
  texts: string[]
  names: string[]
  // Tolerances
  maxSyncDriftSec?: number
  maxEdgeSilenceSec?: number
}

export interface QcIssue {
  code: 'resolution' | 'duration' | 'sync' | 'no_audio' | 'frozen_end' | 'leading_silence' | 'trailing_silence' | 'title' | 'name'
  message: string
}

export interface QcReport {
  passed: boolean
  issues: QcIssue[]
  metrics: ClipMetrics
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = temp
    }
  }
  return prev[b.length]
}

// Reperage des noms propres mal ecrits : un mot a 1 ou 2 fautes d'un nom du dictionnaire du streamer est suspect.
export function checkNames(texts: string[], names: string[]): QcIssue[] {
  const issues: QcIssue[] = []
  const seen = new Set<string>()
  const targets = names.map(n => ({ raw: n, norm: normalizeWord(n) })).filter(n => n.norm.length >= 4)
  for (const word of texts.join(' ').split(/\s+/)) {
    const norm = normalizeWord(word)
    if (norm.length < 4) continue
    for (const target of targets) {
      const distance = levenshtein(norm, target.norm)
      if (distance > 0 && distance <= (target.norm.length >= 8 ? 2 : 1) && !seen.has(norm)) {
        seen.add(norm)
        issues.push({ code: 'name', message: `"${word}" ressemble a "${target.raw}" : orthographe a verifier` })
      }
    }
  }
  return issues
}

export function evaluateQc(metrics: ClipMetrics, expect: QcExpectations): QcReport {
  const issues: QcIssue[] = []
  const drift = expect.maxSyncDriftSec ?? 0.15
  const edge = expect.maxEdgeSilenceSec ?? 0.6

  if (metrics.width !== 1080 || metrics.height !== 1920) {
    issues.push({ code: 'resolution', message: `Resolution ${metrics.width}x${metrics.height} au lieu de 1080x1920` })
  }
  if (metrics.videoSec < expect.minSec - 0.5 || metrics.videoSec > expect.maxSec + 1) {
    issues.push({ code: 'duration', message: `Duree ${metrics.videoSec.toFixed(1)} s hors de [${expect.minSec}, ${expect.maxSec}] s` })
  }
  if (metrics.audioSec === null) {
    issues.push({ code: 'no_audio', message: 'Aucune piste audio' })
  } else if (Math.abs(metrics.audioSec - metrics.videoSec) > drift) {
    issues.push({ code: 'sync', message: `Decalage son/image de ${Math.abs(metrics.audioSec - metrics.videoSec).toFixed(2)} s` })
  }
  if (metrics.freezeAtEndSec !== null) {
    issues.push({ code: 'frozen_end', message: `Image figee en fin de clip (des ${metrics.freezeAtEndSec.toFixed(1)} s)` })
  }
  if (metrics.leadingSilenceSec > edge) {
    issues.push({ code: 'leading_silence', message: `Silence de ${metrics.leadingSilenceSec.toFixed(1)} s au debut` })
  }
  if (metrics.trailingSilenceSec > edge) {
    issues.push({ code: 'trailing_silence', message: `Silence de ${metrics.trailingSilenceSec.toFixed(1)} s a la fin` })
  }

  const lines = expect.title.split(/\s+/).reduce<string[]>((acc, word) => {
    const last = acc[acc.length - 1]
    if (last !== undefined && `${last} ${word}`.length <= expect.titleMaxCharsPerLine) acc[acc.length - 1] = `${last} ${word}`
    else acc.push(word)
    return acc
  }, [])
  if (!expect.title.trim()) issues.push({ code: 'title', message: 'Titre vide' })
  else if (lines.length > expect.titleMaxLines) issues.push({ code: 'title', message: `Titre sur ${lines.length} lignes (max ${expect.titleMaxLines})` })
  else if (/[�]/.test(expect.title)) issues.push({ code: 'title', message: 'Titre avec des caracteres invalides' })

  issues.push(...checkNames([expect.title, ...expect.texts], expect.names))
  return { passed: issues.length === 0, issues, metrics }
}

export function probeClip(path: string): Pick<ClipMetrics, 'width' | 'height' | 'videoSec' | 'audioSec'> {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,duration', '-of', 'json', path], { encoding: 'utf8' })
  if (probe.status !== 0) throw new Error(`ffprobe a echoue : ${probe.stderr?.trim() ?? ''}`)
  const streams: any[] = JSON.parse(probe.stdout).streams ?? []
  const video = streams.find(s => s.codec_type === 'video')
  const audio = streams.find(s => s.codec_type === 'audio')
  if (!video) throw new Error('Aucune piste video')
  return {
    width: Number(video.width),
    height: Number(video.height),
    videoSec: Number(video.duration),
    audioSec: audio ? Number(audio.duration) : null
  }
}

// Analyse ffmpeg : silences aux deux extremites et image figee dans les 3 dernieres secondes.
export async function collectClipMetrics(path: string, options: RunFfmpegOptions = {}): Promise<ClipMetrics> {
  const base = probeClip(path)
  const silenceLog = await runFfmpeg(['-i', path, '-vn', '-af', 'silencedetect=noise=-35dB:d=0.3', '-f', 'null', '-'], options)
  const freezeLog = await runFfmpeg(['-sseof', '-3', '-i', path, '-an', '-vf', 'freezedetect=n=-55dB:d=0.8', '-f', 'null', '-'], options)

  let leading = 0
  let trailing = 0
  const starts = [...silenceLog.matchAll(/silence_start: (-?[\d.]+)/g)].map(m => Number(m[1]))
  const ends = [...silenceLog.matchAll(/silence_end: ([\d.]+)/g)].map(m => Number(m[1]))
  const audioSec = base.audioSec ?? base.videoSec
  if (starts.length && starts[0] <= 0.05) leading = ends.length ? ends[0] : audioSec
  if (starts.length) {
    const lastStart = starts[starts.length - 1]
    const lastEnd = ends.length >= starts.length ? ends[starts.length - 1] : audioSec
    if (lastEnd >= audioSec - 0.1) trailing = audioSec - Math.max(0, lastStart)
  }

  const freeze = freezeLog.match(/freeze_start: ([\d.]+)/)
  const freezeAtEndSec = freeze ? Math.max(0, base.videoSec - 3) + Number(freeze[1]) : null
  return { ...base, freezeAtEndSec, leadingSilenceSec: leading, trailingSilenceSec: trailing }
}
