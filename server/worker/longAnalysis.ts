import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prisma } from '../utils/prisma'
import { readEnv } from '../utils/env'
import { retrying } from '../utils/clipping/dbRetry'
import { createPrismaLongAnalysisStore } from '../utils/clipping/prismaLongAnalysisStore'
import { stepAnalysis } from '../utils/clipping/longAnalysisRun'
import type { AnalysisJob } from '../utils/clipping/longAnalysisRun'
import { createLongCandidateFinder, LongLlmError } from '../utils/clipping/longAnalysisLlm'
import { compactSegments } from '../utils/clipping/longAnalysis'
import { extractAudioWindow } from '../utils/clipping/audioWindow'
import { transcribeWav } from '../utils/clipping/whisperTranscribe'
import { getVodAudioPlaylistUrl, VodPlaylistError } from '../utils/clipping/vodPlaylist'
import { describeVodError } from '../utils/clipping/vodAccess'

// Analyse d'un live entier a la demande du streamer (« Analyser ce live ») : transcription par tranches de 5 minutes, une par passage du
// worker quand la file de rendu est vide, puis recherche des passages par Claude. Desactivable : WORKER_LONG_ANALYSIS=0.
const retryAfter = new Map<string, number>()
const failures = new Map<string, number>()
const RETRY_MS = 10 * 60_000
const MAX_FAILURES = 3

const store = createPrismaLongAnalysisStore(prisma, { skip: () => [...retryAfter].filter(([, at]) => at > Date.now()).map(([id]) => id) })
const safeStore = { ...retrying(store, { onRetry: (error, attempt) => console.warn(`[worker] base injoignable (tentative ${attempt}), nouvel essai`) }), notify: store.notify }

// Duree d'une video lue par ffprobe (quand la VOD n'a pas de debut et de fin connus).
function probeUrlDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', url], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
    child.on('error', reject)
    child.on('close', () => {
      const seconds = Number(out.trim())
      Number.isFinite(seconds) && seconds > 0 ? resolve(seconds) : reject(new Error('Durée du live illisible'))
    })
  })
}

async function transcribeSlice(job: AnalysisJob, startSec: number, durationSec: number) {
  const audioUrl = await getVodAudioPlaylistUrl(job.twitchVodId)
  const wav = join(tmpdir(), `clippeak-long-${randomUUID()}.wav`)
  try {
    await extractAudioWindow(audioUrl, startSec, durationSec, wav, { timeoutMs: 10 * 60_000 })
    const result = await transcribeWav(wav, { timeoutMs: 20 * 60_000 })
    return compactSegments(result.segments, startSec)
  } finally {
    await unlink(wav).catch(() => {})
  }
}

// Traite UNE unite de travail de l'analyse la plus ancienne. Renvoie true si le worker a travaille.
export async function longAnalysisStep(): Promise<boolean> {
  if (readEnv('WORKER_LONG_ANALYSIS') === '0') return false
  const job = await safeStore.next()
  if (!job) return false

  const apiKey = readEnv('ANTHROPIC_API_KEY')
  if (!apiKey) {
    await safeStore.fail(job.id, 'failed', 'L’analyse n’est pas configurée sur ce serveur (clé Claude absente). Écris à contact.clippeak@sassify.fr.')
    return true
  }
  const findCandidates = createLongCandidateFinder({ apiKey, model: readEnv('CLIPPEAK_LLM_MODEL') || undefined })

  try {
    const result = await stepAnalysis(job, {
      store: safeStore,
      probeDurationSec: async j => probeUrlDuration(await getVodAudioPlaylistUrl(j.twitchVodId)),
      transcribeSlice,
      findCandidates
    })
    failures.delete(job.id)
    if (result === 'finished') {
      const done = await prisma.longAnalysis.findUnique({ where: { id: job.id }, select: { proposalsCount: true } })
      await safeStore.notify(job, done?.proposalsCount ?? 0).catch(() => {})
      console.info(`[worker] analyse du live ${job.twitchVodId} terminee : ${done?.proposalsCount ?? 0} proposition(s)`)
    }
  } catch (error) {
    // VOD privee ou supprimee : inutile de reessayer, le streamer est prevenu.
    if (error instanceof VodPlaylistError && (error.kind === 'restricted' || error.kind === 'token')) {
      await safeStore.fail(job.id, 'impossible', describeVodError(error))
      return true
    }
    const count = (failures.get(job.id) ?? 0) + 1
    failures.set(job.id, count)
    const message = error instanceof LongLlmError || error instanceof Error ? error.message : 'Erreur inconnue'
    console.error(`[worker] analyse du live ${job.twitchVodId} en echec (${count}/${MAX_FAILURES})`, message)
    if (count >= MAX_FAILURES || (error instanceof LongLlmError && !error.retryable)) {
      await safeStore.fail(job.id, 'failed', error instanceof LongLlmError ? message : describeVodError(error))
      failures.delete(job.id)
    } else {
      retryAfter.set(job.id, Date.now() + RETRY_MS)
    }
  }
  return true
}
