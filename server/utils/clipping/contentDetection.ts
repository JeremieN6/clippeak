import type { ChatPeak } from './chatPeaks.ts'
import type { AnalyzedMoment } from './vodAnalysis.ts'
import type { MomentKind, MomentScore } from './momentScoring.ts'
import type { TranscriptSegment } from './whisperTranscribe.ts'

// Detection des clips verticaux par le CONTENU du live : on lit la transcription entiere (pas seulement autour des pics de chat), Claude y repere
// les moments de 20 a 60 secondes (une accroche, puis une chute), et le chat n'est plus qu'un bonus de note. Fichier pur (aucun import Node).

export const DETECTION_MODES = ['both', 'content', 'chat'] as const
export type DetectionMode = (typeof DETECTION_MODES)[number]

export const DETECTION_LABELS: Record<DetectionMode, string> = {
  both: 'Contenu + chat',
  content: 'Contenu seul',
  chat: 'Chat seul'
}

export function parseDetectionMode(value: unknown): DetectionMode {
  return (DETECTION_MODES as readonly string[]).includes(value as string) ? value as DetectionMode : 'both'
}

// La detection par le contenu tourne dans les modes « contenu + chat » et « contenu seul » ; le chat dans « contenu + chat » et « chat seul ».
export const usesContent = (mode: DetectionMode) => mode !== 'chat'
export const usesChat = (mode: DetectionMode) => mode !== 'content'

// Plafond d'audio analyse par mois (la transcription est le poste de cout) : 10 h en gratuit, 100 h chez Creator, jamais plafonne pour les
// chaines de demo et de test ou celles que l'admin a rendues illimitees.
export const FREE_DETECTION_HOURS = 10
export const CREATOR_DETECTION_HOURS = 100

export function detectionCapSec(input: { paying: boolean, unlimited: boolean }): number | null {
  if (input.unlimited) return null
  return (input.paying ? CREATOR_DETECTION_HOURS : FREE_DETECTION_HOURS) * 3600
}

export const detectionSecLeft = (capSec: number | null, usedSec: number): number => capSec === null ? Number.POSITIVE_INFINITY : Math.max(0, capSec - Math.max(0, usedSec))

// Un moment vise 20 a 60 s : l'extrait source garde 60 s avant le point d'attention (voir sourceExtract.ts), la chute est donc placee 2 s avant la fin.
export const MOMENT_MIN_SEC = 20
export const MOMENT_MAX_SEC = 60
export const PEAK_BEFORE_END_SEC = 2

// Fenetres relues par Claude : 30 minutes, avec un recouvrement pour ne pas couper un moment a la jonction.
export const WINDOW_SEC = 30 * 60
export const WINDOW_OVERLAP_SEC = 4 * 60

const pad = (n: number) => String(n).padStart(2, '0')
export const clock = (sec: number) => { const s = Math.max(0, Math.floor(sec)); return `${Math.floor(s / 3600)}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}` }

export interface ContentWindow { startSec: number, endSec: number, text: string }

// Decoupe [fromSec, toSec] de la transcription en fenetres lisibles par Claude : une ligne par phrase, precedee de son heure dans le live.
export function buildWindows(segments: TranscriptSegment[], fromSec: number, toSec: number, options: { windowSec?: number, overlapSec?: number } = {}): ContentWindow[] {
  const windowSec = options.windowSec ?? WINDOW_SEC
  const step = windowSec - (options.overlapSec ?? WINDOW_OVERLAP_SEC)
  const out: ContentWindow[] = []
  for (let start = Math.max(0, fromSec); start < toSec; start += step) {
    const end = Math.min(toSec, start + windowSec)
    const lines = segments.filter(s => s.text.trim() && s.end > start && s.start < end).map(s => `[${clock(s.start)}] ${s.text.trim()}`)
    if (lines.length) out.push({ startSec: start, endSec: end, text: lines.join('\n') })
    if (end >= toSec) break
  }
  return out
}

export interface PromptContext {
  // Ce que Claude sait du streamer : sujets et categories de ses clips, titres de ses clips de reference.
  styleNotes?: string
}

export function detectionPrompt(minSec = MOMENT_MIN_SEC, maxSec = MOMENT_MAX_SEC, context: PromptContext = {}): string {
  return [
    'Tu aides un streamer francophone a choisir les meilleurs passages de son live pour en faire des clips verticaux (TikTok, Shorts, Reels).',
    'Tu recois la transcription d\'une partie du live, une ligne par phrase, chacune precedee de son heure ([h:mm:ss]).',
    `Repere les MOMENTS de ${minSec} a ${maxSec} secondes qui marchent seuls : une accroche qui donne envie de rester dans les premieres secondes (une question,`,
    'une affirmation forte, une histoire qui demarre), puis une chute (blague, revelation, coup de gueule, retournement, reaction). Le moment doit se comprendre sans',
    'avoir vu le reste du live. Ecarte les silences, la gestion technique du stream, les remerciements, la lecture de messages sans reaction et les passages sans chute.',
    'Commence a une phrase complete et finis juste apres la chute (la derniere phrase est la chute elle-meme).',
    context.styleNotes ? `Ce que l'on sait du style de ce streamer et de ses clips qui ont marche : ${context.styleNotes}. Prefere les moments qui ressemblent a ces clips.` : '',
    'Reponds UNIQUEMENT par un tableau JSON (6 elements au plus, vide si rien ne convient) :',
    '[{"start": heure de debut en secondes, "end": heure de fin en secondes, "hook": la phrase d\'accroche (reprise de la transcription),',
    '"title": titre court et accrocheur de 70 caracteres au plus, sans guillemets ni emoji, "category": un mot (humour, histoire, opinion, jeu, reaction...),',
    '"kind": "story" | "opinion" | "punchline" | "other", "score": nombre de 0 a 10 (potentiel de viralite), "why": une phrase qui explique la note}].'
  ].filter(Boolean).join(' ')
}

export interface ContentCandidate {
  startSec: number
  endSec: number
  hook: string
  title: string
  category: string
  kind: MomentKind
  score: number
  why: string
}

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()
const num = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.')) : Number.NaN
  return Number.isFinite(n) ? n : null
}
const KINDS: MomentKind[] = ['story', 'opinion', 'punchline', 'other']

// Lit la reponse de Claude : un tableau JSON, eventuellement entoure de texte. Les elements invalides sont ignores.
export function parseContentCandidates(text: string): ContentCandidate[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let raw: unknown
  try { raw = JSON.parse(text.slice(start, end + 1)) } catch { return [] }
  if (!Array.isArray(raw)) return []
  const out: ContentCandidate[] = []
  for (const item of raw as any[]) {
    const startSec = num(item?.start)
    const endSec = num(item?.end)
    const score = num(item?.score)
    if (startSec === null || endSec === null || score === null || startSec < 0 || endSec <= startSec) continue
    out.push({
      startSec, endSec,
      hook: clean(String(item?.hook ?? '')).slice(0, 200),
      title: clean(String(item?.title ?? '').replace(/["«»]/g, '')).slice(0, 100),
      category: clean(String(item?.category ?? 'general')).slice(0, 60) || 'general',
      kind: KINDS.includes(item?.kind) ? item.kind : 'other',
      score: Math.round(Math.min(10, Math.max(0, score)) * 10) / 10,
      why: clean(String(item?.why ?? '')).slice(0, 300)
    })
  }
  return out
}

const overlapSec = (a: { startSec: number, endSec: number }, b: { startSec: number, endSec: number }) => Math.max(0, Math.min(a.endSec, b.endSec) - Math.max(a.startSec, b.startSec))

// Recale le moment sur les phrases (debut = debut de la phrase la plus proche, fin = fin de la phrase la plus proche) et le ramene a la duree permise.
export function snapMoment(c: ContentCandidate, segments: TranscriptSegment[], minSec = MOMENT_MIN_SEC, maxSec = MOMENT_MAX_SEC): ContentCandidate | null {
  const spoken = segments.filter(s => s.text.trim() && s.end > s.start)
  if (!spoken.length) return null
  const nearest = (values: number[], target: number) => values.reduce((best, v) => Math.abs(v - target) < Math.abs(best - target) ? v : best, values[0]!)
  const startSec = nearest(spoken.map(s => s.start), c.startSec)
  let endSec = nearest(spoken.map(s => s.end), c.endSec)
  if (endSec - startSec > maxSec) {
    const fits = spoken.filter(s => s.end <= startSec + maxSec && s.end > startSec).map(s => s.end)
    if (!fits.length) return null
    endSec = Math.max(...fits)
  }
  return endSec - startSec >= minSec ? { ...c, startSec, endSec } : null
}

export interface SelectOptions {
  max: number
  minScore?: number
  // Instants (temps de VOD) de moments deja crees sur ce live : on n'y revient pas.
  existingPeaks?: number[]
  // Fin du transcrit utilisable (un moment qui deborde est garde pour le passage suivant).
  limitSec?: number
  minSec?: number
  maxSec?: number
}

// Les meilleurs moments : durees valides, meilleure note d'abord, jamais deux moments qui se recouvrent ni un moment sur un instant deja pris.
export function selectContentMoments(candidates: ContentCandidate[], segments: TranscriptSegment[], options: SelectOptions): ContentCandidate[] {
  const minScore = options.minScore ?? 5
  const ready: ContentCandidate[] = []
  for (const raw of candidates) {
    const c = snapMoment(raw, segments, options.minSec, options.maxSec)
    if (!c || c.score < minScore) continue
    if (options.limitSec !== undefined && c.endSec > options.limitSec) continue
    ready.push(c)
  }
  const existing = options.existingPeaks ?? []
  const chosen: ContentCandidate[] = []
  for (const c of ready.sort((a, b) => b.score - a.score)) {
    if (chosen.length >= options.max) break
    const peak = c.endSec - PEAK_BEFORE_END_SEC
    if (existing.some(p => p > c.startSec - 5 && p < c.endSec + 5)) continue
    if (chosen.some(o => overlapSec(c, o) > 0)) continue
    if (existing.some(p => Math.abs(p - peak) < 30)) continue
    chosen.push(c)
  }
  return chosen.sort((a, b) => a.startSec - b.startSec)
}

// Bonus de note quand le chat a reagi pendant le moment (ou juste apres la chute) : +1, +1,5 si la reaction est forte. Jamais au-dela de 10.
export function chatBonus(c: { startSec: number, endSec: number }, peaks: ChatPeak[]): { bonus: number, peak: ChatPeak | null } {
  const hits = peaks.filter(p => p.peakSec >= c.startSec - 5 && p.peakSec <= c.endSec + 15)
  if (!hits.length) return { bonus: 0, peak: null }
  const best = hits.reduce((a, b) => b.score > a.score ? b : a)
  return { bonus: best.score >= 6 ? 1.5 : 1, peak: best }
}

// Un moment retenu, presente au reste du pipeline (coupe, rendu, controle qualite) comme un moment issu d'un pic : la chute est le « pic ».
export function toAnalyzedMoment(c: ContentCandidate, all: TranscriptSegment[], options: { peaks?: ChatPeak[], similarityNote?: string, similarityScore?: number, contextAfterSec?: number } = {}): AnalyzedMoment {
  const { bonus, peak: chat } = chatBonus(c, options.peaks ?? [])
  const base = options.similarityScore ?? c.score
  const score = Math.round(Math.min(10, base + bonus) * 10) / 10
  const segments = all.filter(s => s.text.trim() && s.end > c.startSec - 5 && s.start < c.endSec + (options.contextAfterSec ?? 20))
  const text = all.filter(s => s.end > c.startSec && s.start < c.endSec).map(s => s.text.trim()).join(' ')
  const notes = [c.why, options.similarityNote, chat ? `le chat a reagi (+${bonus})` : ''].filter(Boolean).join(' ; ')
  const momentScore: MomentScore = {
    score, kind: c.kind, hook: c.hook, category: c.category, summary: c.title,
    rationale: `detecte par le contenu du live${notes ? ` : ${notes}` : ''}`.slice(0, 500),
    scorer: 'claude'
  }
  return {
    peak: {
      startSec: c.startSec,
      endSec: c.endSec + 5,
      peakSec: c.endSec - PEAK_BEFORE_END_SEC,
      score: Math.round(Math.min(10, c.score) * 10) / 10,
      signals: chat ? chat.signals : { messages: 0, rateZ: 0, keywordShare: 0, capsShare: 0 }
    },
    transcript: {
      windowStartSec: segments[0]?.start ?? c.startSec,
      windowDurationSec: Math.ceil(c.endSec + (options.contextAfterSec ?? 20) - (segments[0]?.start ?? c.startSec)),
      segments,
      beforePeak: text,
      transcribeSec: 0
    },
    score: momentScore
  }
}

// Quand lancer la lecture par Claude : par passages de 30 minutes de transcription nouvelle, et un dernier passage a la fin du live.
export function shouldDetect(state: { transcribedSec: number, detectedSec: number, finished: boolean }, options: { everySec?: number } = {}): boolean {
  const pending = state.transcribedSec - state.detectedSec
  if (pending < 60) return false
  return state.finished || pending >= (options.everySec ?? WINDOW_SEC)
}
