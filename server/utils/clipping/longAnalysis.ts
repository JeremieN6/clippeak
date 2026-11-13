import { LONG_MIN_SEC, formatClock } from './longExtract.ts'

// Analyse d'un live entier pour proposer des extraits longs : la transcription est decoupee en fenetres de 30 minutes, Claude y repere les
// passages qui se tiennent (un sujet du debut a la fin), puis on ne garde que les meilleurs, sans chevauchement. Fichier pur (aucun import Node).

export interface Seg { s: number, e: number, t: string }

export const CHUNK_SEC = 30 * 60
// Recouvrement entre fenetres : un passage a cheval sur deux fenetres est vu en entier par l'une d'elles.
export const CHUNK_OVERLAP_SEC = 4 * 60
export const MAX_PROPOSALS = 8

// Nombre de propositions selon la duree du live : environ 2 par heure, de 3 a 8.
export const defaultCandidateLimit = (durationSec: number) => Math.min(MAX_PROPOSALS, Math.max(3, Math.round(durationSec / 3600 * 2)))

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()

// Transcription compacte (secondes arrondies a la dixieme) : c'est ce qui est garde en base.
export function compactSegments(segments: Array<{ start: number, end: number, text: string }>, offsetSec = 0): Seg[] {
  return segments
    .map(seg => ({ s: Math.round((seg.start + offsetSec) * 10) / 10, e: Math.round((seg.end + offsetSec) * 10) / 10, t: clean(seg.text) }))
    .filter(seg => seg.t && seg.e > seg.s)
}

export interface Chunk { startSec: number, endSec: number, text: string }

// Fenetres de la transcription, une ligne par phrase avec son heure de debut dans le live (h:mm:ss) : c'est ce que lit Claude.
export function buildChunks(segments: Seg[], options: { chunkSec?: number, overlapSec?: number } = {}): Chunk[] {
  const chunkSec = options.chunkSec ?? CHUNK_SEC
  const overlap = options.overlapSec ?? CHUNK_OVERLAP_SEC
  if (!segments.length) return []
  const last = segments[segments.length - 1].e
  const chunks: Chunk[] = []
  for (let start = 0; start < last; start += chunkSec - overlap) {
    const end = Math.min(last, start + chunkSec)
    const lines = segments.filter(seg => seg.e > start && seg.s < end).map(seg => `[${formatClock(Math.floor(seg.s), true)}] ${seg.t}`)
    if (lines.length) chunks.push({ startSec: start, endSec: end, text: lines.join('\n') })
    if (end >= last) break
  }
  return chunks
}

export const SYSTEM_PROMPT = [
  'Tu aides un streamer francophone a publier sur YouTube des extraits de ses lives. Tu recois la transcription d\'une partie d\'un live, une ligne par phrase,',
  'chacune precedee de son heure dans le live ([h:mm:ss]). Repere les PASSAGES CONTINUS qui font une bonne video YouTube : un sujet traite du debut a la fin',
  '(une histoire racontee, un debat, un classement, une reaction developpee, une explication), avec une vraie ouverture et une vraie conclusion, qui se comprennent',
  'sans avoir vu le reste du live. Ecarte les moments de transition, les silences, la gestion technique du stream, les remerciements en boucle et les passages',
  'qui ne se comprennent pas seuls. Chaque passage doit durer entre {MIN} et {MAX} secondes ; commence-le au debut d\'une phrase et finis-le a la fin d\'une phrase.',
  'Reponds UNIQUEMENT par un tableau JSON (5 elements au plus, vide si rien ne convient) : [{"start": heure de debut en secondes, "end": heure de fin en secondes,',
  '"title": titre YouTube accrocheur de 70 caracteres au plus, sans guillemets ni emoji, "theme": le sujet en moins de 12 mots,',
  '"score": nombre de 0 a 10 (interet de ce passage comme video seule), "why": une ou deux phrases qui expliquent la note}].'
].join(' ')

export function systemPrompt(minSec: number, maxSec: number): string {
  return SYSTEM_PROMPT.replace('{MIN}', String(minSec)).replace('{MAX}', String(maxSec))
}

export interface Candidate { startSec: number, endSec: number, title: string, theme: string, score: number, why: string }

const num = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.')) : Number.NaN
  return Number.isFinite(n) ? n : null
}

// Lit la reponse du modele : un tableau JSON, eventuellement entoure de texte. Les elements invalides sont ignores.
export function parseCandidates(text: string): Candidate[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let raw: unknown
  try { raw = JSON.parse(text.slice(start, end + 1)) } catch { return [] }
  if (!Array.isArray(raw)) return []
  const out: Candidate[] = []
  for (const item of raw as any[]) {
    const startSec = num(item?.start)
    const endSec = num(item?.end)
    const score = num(item?.score)
    const title = clean(String(item?.title ?? '').replace(/["«»]/g, '')).slice(0, 100)
    if (startSec === null || endSec === null || score === null || endSec <= startSec || startSec < 0 || !title) continue
    out.push({
      startSec, endSec, title,
      theme: clean(String(item?.theme ?? '')).slice(0, 160),
      score: Math.round(Math.min(10, Math.max(0, score)) * 10) / 10,
      why: clean(String(item?.why ?? '')).slice(0, 600)
    })
  }
  return out
}

// Recale le passage sur les phrases : le debut sur le debut de la phrase la plus proche, la fin sur la fin de la phrase la plus proche.
export function snapCandidate(candidate: Candidate, segments: Seg[]): Candidate {
  if (!segments.length) return candidate
  const nearest = (values: number[], target: number) => values.reduce((best, v) => Math.abs(v - target) < Math.abs(best - target) ? v : best, values[0])
  const startSec = nearest(segments.map(s => s.s), candidate.startSec)
  const endSec = nearest(segments.map(s => s.e), candidate.endSec)
  return endSec > startSec ? { ...candidate, startSec, endSec } : candidate
}

export interface SelectOptions { minSec?: number, maxSec: number, max?: number, vodDurationSec?: number | null, taken?: Array<{ startSec: number, endSec: number }> }

const overlap = (a: { startSec: number, endSec: number }, b: { startSec: number, endSec: number }) =>
  Math.max(0, Math.min(a.endSec, b.endSec) - Math.max(a.startSec, b.startSec))

// Les meilleurs passages : durees valides (ceux qui depassent la duree maximale sont raccourcis a la derniere phrase qui tient), meilleure note
// d'abord, jamais deux passages qui se recouvrent de plus d'un tiers du plus court, ni un passage deja pris (propose, ignore ou prepare).
export function selectProposals(candidates: Candidate[], segments: Seg[], options: SelectOptions): Candidate[] {
  const minSec = options.minSec ?? LONG_MIN_SEC
  const limit = options.vodDurationSec && options.vodDurationSec > 0 ? options.vodDurationSec : Infinity
  const ready: Candidate[] = []
  for (const raw of candidates) {
    let c = snapCandidate(raw, segments)
    if (c.endSec - c.startSec > options.maxSec) {
      const fits = segments.filter(s => s.e <= c.startSec + options.maxSec && s.e > c.startSec).map(s => s.e)
      c = { ...c, endSec: fits.length ? Math.max(...fits) : c.startSec + options.maxSec }
    }
    c = { ...c, endSec: Math.min(c.endSec, limit) }
    if (c.endSec - c.startSec < minSec) continue
    ready.push(c)
  }
  const chosen: Candidate[] = []
  const taken = options.taken ?? []
  for (const c of ready.sort((a, b) => b.score - a.score)) {
    if (chosen.length >= (options.max ?? MAX_PROPOSALS)) break
    const clashes = (other: { startSec: number, endSec: number }) => overlap(c, other) > Math.min(c.endSec - c.startSec, other.endSec - other.startSec) / 3
    if (chosen.some(clashes) || taken.some(clashes)) continue
    chosen.push(c)
  }
  return chosen.sort((a, b) => a.startSec - b.startSec)
}

// Avancement montre au streamer : la transcription compte pour 90 %, la recherche des passages pour le reste.
export function analysisProgress(status: string, transcribedSec: number, durationSec: number | null): number {
  if (status === 'done') return 100
  if (status === 'queued' && transcribedSec <= 0) return 0
  if (!durationSec || durationSec <= 0) return 0
  const ratio = Math.min(1, transcribedSec / durationSec)
  return ratio >= 0.995 ? 95 : Math.floor(ratio * 90)
}
