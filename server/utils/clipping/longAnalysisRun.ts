import { buildChunks, defaultCandidateLimit, selectProposals } from './longAnalysis.ts'
import type { Candidate, Seg } from './longAnalysis.ts'

// Une etape de l'analyse d'un live, appelee par le worker quand il n'a rien d'autre a faire : soit transcrire la tranche suivante du live,
// soit, la transcription finie, chercher les passages avec Claude et creer les propositions. Un appel = une unite de travail.

export interface AnalysisJob {
  id: string
  vodId: string
  channelId: string
  twitchVodId: string
  vodTitle: string | null
  status: string
  transcribedSec: number
  durationSec: number | null
  transcript: Seg[]
  maxSec: number
  // Passages deja pris sur ce live (proposes a la main, ignores, prepares) : on n'y revient pas.
  taken: Array<{ startSec: number, endSec: number }>
}

export interface NewAnalysisProposal { title: string, theme: string, why: string, score: number, startSec: number, endSec: number }

export interface AnalysisStore {
  next: () => Promise<AnalysisJob | null>
  markRunning: (id: string, durationSec: number) => Promise<void>
  appendTranscript: (id: string, segments: Seg[], transcribedSec: number) => Promise<void>
  finish: (job: AnalysisJob, proposals: NewAnalysisProposal[]) => Promise<void>
  fail: (id: string, status: 'failed' | 'impossible', error: string) => Promise<void>
}

export interface AnalysisDeps {
  store: AnalysisStore
  // Duree du live en secondes quand elle n'est pas connue (lecture de la video).
  probeDurationSec: (job: AnalysisJob) => Promise<number>
  // Transcrit [startSec, startSec + durationSec] du live ; les heures rendues sont celles du live.
  transcribeSlice: (job: AnalysisJob, startSec: number, durationSec: number) => Promise<Seg[]>
  // Passages d'une fenetre de la transcription (Claude).
  findCandidates: (chunk: { text: string, startSec: number, endSec: number }, limits: { minSec: number, maxSec: number }) => Promise<Candidate[]>
  sliceSec?: number
}

const SLICE_SEC = 300
const MIN_SEC = 180

export async function stepAnalysis(job: AnalysisJob, deps: AnalysisDeps): Promise<'transcribed' | 'finished'> {
  const { store } = deps
  let duration = job.durationSec
  if (!duration || duration <= 0) {
    duration = await deps.probeDurationSec(job)
    await store.markRunning(job.id, duration)
  } else if (job.status === 'queued') {
    await store.markRunning(job.id, duration)
  }

  if (job.transcribedSec < duration - 10) {
    const slice = deps.sliceSec ?? SLICE_SEC
    const start = job.transcribedSec
    const length = Math.min(slice, duration - start)
    const segments = await deps.transcribeSlice(job, start, length)
    await store.appendTranscript(job.id, segments, Math.min(duration, start + length))
    return 'transcribed'
  }

  // Transcription finie : recherche des passages, une fenetre apres l'autre.
  const chunks = buildChunks(job.transcript)
  const found: Candidate[] = []
  for (const chunk of chunks) found.push(...await deps.findCandidates(chunk, { minSec: MIN_SEC, maxSec: job.maxSec }))
  const chosen = selectProposals(found, job.transcript, { maxSec: job.maxSec, vodDurationSec: duration, taken: job.taken, max: defaultCandidateLimit(duration) })
  await store.finish(job, chosen.map(c => ({ title: c.title, theme: c.theme, why: c.why, score: c.score, startSec: c.startSec, endSec: c.endSec })))
  return 'finished'
}

