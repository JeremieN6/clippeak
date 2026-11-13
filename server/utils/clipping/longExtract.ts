// Extraits longs YouTube : un passage du live (30 s a 15 min) choisi par le streamer, rendu tel quel en 16:9 (sans sous-titres ni titre
// grave) puis publie sur YouTube comme une video classique. Fichier pur (aucun import Node) : il sert aussi a la page du studio.

export const LONG_MIN_SEC = 30
export const LONG_DEFAULT_MAX_SEC = 600
// 15 minutes : limite de YouTube pour une chaine dont le telephone n'est pas verifie.
export const LONG_ABSOLUTE_MAX_SEC = 900
export const LONG_WIDTH = 1280
export const LONG_HEIGHT = 720

export function clampLongMax(sec: number): number {
  if (!Number.isFinite(sec)) return LONG_DEFAULT_MAX_SEC
  return Math.min(LONG_ABSOLUTE_MAX_SEC, Math.max(LONG_MIN_SEC, Math.round(sec)))
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`
}

// « 1:23:45 », « 23:45 » ou « 45 » (secondes) -> secondes ; null si illisible.
export function parseClock(text: string): number | null {
  const parts = text.trim().split(':')
  if (!parts.length || parts.length > 3 || parts.some(p => !/^\d{1,5}$/.test(p.trim()))) return null
  const nums = parts.map(Number)
  if (nums.length > 1 && nums.slice(1).some(n => n > 59)) return null
  return nums.reduce((total, n) => total * 60 + n, 0)
}

// Controle du passage choisi : renvoie le message a montrer au streamer, ou null si tout va bien.
export function validateLongRange(input: { startSec: number, endSec: number, maxSec: number, vodDurationSec?: number | null }): string | null {
  const { startSec, endSec, maxSec } = input
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec < 0) return 'Le début et la fin doivent être des durées valides.'
  if (endSec <= startSec) return 'La fin doit venir après le début.'
  const length = endSec - startSec
  if (length < LONG_MIN_SEC) return `Un extrait dure au moins ${LONG_MIN_SEC} secondes (celui-ci : ${Math.round(length)} s).`
  if (length > maxSec) return `Un extrait dure au plus ${formatClock(maxSec)} (celui-ci : ${formatClock(length)}).`
  if (input.vodDurationSec && endSec > input.vodDurationSec + 60) return `Ce passage dépasse la fin du live (${formatClock(input.vodDurationSec)}).`
  return null
}

// Coupe d'un passage de la VOD : 16:9 1280x720 (la VOD est lue en 720p), image et son d'origine, poids maitrise (un envoi YouTube
// se fait en une fois : environ 3,5 Mbit/s au plus, soit moins de 270 Mo pour 10 minutes).
export function buildLongRenderArgs(input: { input: string, startSec: number, durationSec: number, outPath: string, threads?: number }): string[] {
  return [
    '-y', '-hide_banner',
    '-ss', input.startSec.toFixed(2), '-i', input.input, '-t', input.durationSec.toFixed(2),
    '-vf', `scale=${LONG_WIDTH}:${LONG_HEIGHT}:force_original_aspect_ratio=decrease,pad=${LONG_WIDTH}:${LONG_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-maxrate', '3500k', '-bufsize', '7000k', '-pix_fmt', 'yuv420p',
    ...(input.threads ? ['-threads', String(input.threads)] : []),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
    '-movflags', '+faststart', input.outPath
  ]
}

export interface LongMetrics { width: number, height: number, videoSec: number, audioSec: number | null }
export interface LongQcIssue { severity: 'error' | 'warning', code: string, message: string }
export interface LongQcReport { passed: boolean, issues: LongQcIssue[], metrics: LongMetrics }

// Controle qualite d'un extrait long : format 16:9, duree attendue, son present et synchrone. (Pas de controle de silences ni de
// sous-titres : l'extrait est rendu tel que le streamer l'a choisi.)
export function evaluateLongQc(metrics: LongMetrics, expectedSec: number): LongQcReport {
  const issues: LongQcIssue[] = []
  if (metrics.width !== LONG_WIDTH || metrics.height !== LONG_HEIGHT) {
    issues.push({ severity: 'error', code: 'resolution', message: `Format ${metrics.width}x${metrics.height} au lieu de ${LONG_WIDTH}x${LONG_HEIGHT} (16:9)` })
  }
  if (Math.abs(metrics.videoSec - expectedSec) > Math.max(3, expectedSec * 0.02)) {
    issues.push({ severity: 'error', code: 'duration', message: `Durée ${metrics.videoSec.toFixed(1)} s au lieu de ${expectedSec.toFixed(0)} s : la fin du passage n’a peut-être pas pu être lue` })
  }
  if (metrics.audioSec === null) issues.push({ severity: 'error', code: 'no_audio', message: 'Aucune piste audio' })
  else if (Math.abs(metrics.audioSec - metrics.videoSec) > 0.5) issues.push({ severity: 'error', code: 'sync', message: `Décalage son/image de ${Math.abs(metrics.audioSec - metrics.videoSec).toFixed(2)} s` })
  return { passed: !issues.some(i => i.severity === 'error'), issues, metrics }
}

// Titre YouTube d'un extrait long : 100 caracteres au plus, jamais de « #Shorts » (ce n'est pas un Short).
export function longYoutubeMetadata(title: string, caption: string, hashtags = ''): { title: string, description: string } {
  const clean = (text: string) => text.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
  const base = clean(title) || 'Extrait de live'
  const cut = base.length > 100 ? `${base.slice(0, 99).trimEnd()}…` : base
  const tags = clean(hashtags).split(' ').filter(t => t && t.toLowerCase() !== '#shorts')
  const description = [clean(caption), tags.join(' ')].filter(Boolean).join('\n\n')
  return { title: cut, description: description.slice(0, 4900) }
}
