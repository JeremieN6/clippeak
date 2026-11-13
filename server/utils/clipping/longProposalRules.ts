import { formatClock, validateLongRange } from './longExtract.ts'

// Regles pures des propositions d'extraits longs (sans base de donnees) : live lisible, passage valide, etat montre au streamer.

export const READABLE_VOD_STATUSES = ['ended', 'analyzing', 'done'] as const

// Message a montrer au streamer si le passage ne convient pas, sinon null. `vod` doit etre un live de la chaine.
export function rangeProblem(vod: { startedAt: Date | null, endedAt: Date | null }, maxSec: number, startSec: number, endSec: number): string | null {
  const duration = vod.startedAt && vod.endedAt ? (vod.endedAt.getTime() - vod.startedAt.getTime()) / 1000 : null
  return validateLongRange({ startSec, endSec, maxSec, vodDurationSec: duration })
}

export const defaultTitle = (vodTitle: string | null, startSec: number) => (vodTitle ? `${vodTitle} (${formatClock(startSec)})` : `Extrait de live (${formatClock(startSec)})`).slice(0, 100)

export interface ProposalRow {
  id: string
  origin: string
  status: string
  title: string
  theme: string | null
  why: string | null
  score: number | null
  startSec: number
  endSec: number
  createdAt: Date
  vod: { id: string, twitchVodId: string, title: string | null, startedAt: Date | null, createdAt: Date }
  clipJob: { status: string } | null
}

// Etat montre au streamer : proposee, ignoree, en preparation (rendu en file ou en cours) ou « dans A valider » (rendu pret). Une proposition
// dont l'extrait a ete approuve, refuse ou a echoue n'est plus une proposition : elle vit dans la liste des videos (null).
export function proposalState(row: Pick<ProposalRow, 'status' | 'clipJob'>): 'proposed' | 'ignored' | 'preparing' | 'validate' | null {
  if (row.status === 'ignored') return 'ignored'
  if (row.status === 'prepared') {
    const job = row.clipJob?.status
    if (job === 'queued' || job === 'rendering') return 'preparing'
    if (job === 'review') return 'validate'
    return null
  }
  return 'proposed'
}

export function proposalView(row: ProposalRow) {
  const state = proposalState(row)
  if (!state) return null
  return {
    id: row.id,
    origin: row.origin,
    state,
    title: row.title,
    theme: row.theme,
    why: row.why,
    score: row.score,
    startSec: row.startSec,
    endSec: row.endSec,
    durationSec: Math.round(row.endSec - row.startSec),
    createdAt: row.createdAt,
    vod: { id: row.vod.id, twitchVodId: row.vod.twitchVodId, title: row.vod.title, startedAt: row.vod.startedAt ?? row.vod.createdAt }
  }
}
