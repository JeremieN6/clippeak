import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readEnv } from '../utils/env'
import { prisma } from '../utils/prisma'
import { retrying } from '../utils/clipping/dbRetry'
import { createContentStore } from '../utils/clipping/prismaContentStore'
import type { ContentTarget } from '../utils/clipping/prismaContentStore'
import { createPipelineStore } from '../utils/clipping/prismaPipelineStore'
import { getVodAudioPlaylistUrl, VodPlaylistError } from '../utils/clipping/vodPlaylist'
import { extractAudioWindow } from '../utils/clipping/audioWindow'
import { transcribeWav } from '../utils/clipping/whisperTranscribe'
import type { TranscriptSegment } from '../utils/clipping/whisperTranscribe'
import { transcribeRemote } from '../utils/clipping/remoteTranscribe'
import { transcribeAuto } from '../utils/clipping/transcribeAuto'
import { nextSlice } from '../utils/clipping/similarityScan'
import { WINDOW_OVERLAP_SEC, buildWindows, selectContentMoments, shouldDetect, toAnalyzedMoment, usesChat } from '../utils/clipping/contentDetection'
import type { ContentCandidate } from '../utils/clipping/contentDetection'
import { createContentFinder } from '../utils/clipping/contentDetectionLlm'
import { LongLlmError } from '../utils/clipping/longAnalysisLlm'
import { detectChatPeaks } from '../utils/clipping/chatPeaks'
import type { ChatPeak } from '../utils/clipping/chatPeaks'
import { fetchVodChat } from '../utils/clipping/twitchChat'
import { buildReferenceProfile, rateAgainstReference } from '../utils/clipping/referenceClips'
import { rateBySimilarity } from '../utils/clipping/referenceSimilarity'
import { describeVodError } from '../utils/clipping/vodAccess'
import { loadReferenceBank, saveSources } from './analysis'

// Detection des clips par le CONTENU du live : on transcrit le live par tranches de 5 minutes (Groq si GROQ_API_KEY, sinon Whisper local), la
// transcription est gardee en base (une seule fois par live), puis Claude la lit par passages de 30 minutes et propose des moments de 20 a 60 s.
// Les moments entrent dans le pipeline habituel (coupe, rendu, controle qualite, lots de 4, validation). Le chat n'est qu'un bonus de note.
// Desactivable : WORKER_CONTENT_DETECTION=0. Un appel = une unite de travail (une tranche, ou une lecture par Claude).
const SLICE_SEC = 300
// Pendant le live, on reste en retrait : l'audio de la tranche doit etre entierement disponible.
const LIVE_SAFETY_SEC = 120
const RETRY_MS = 10 * 60_000
const MAX_FAILURES = 3

const retryDb = { onRetry: (_error: unknown, attempt: number) => console.warn(`[worker] base injoignable (tentative ${attempt}), nouvel essai`) }
const store = retrying(createContentStore(prisma), retryDb)
const pipeline = retrying(createPipelineStore(prisma), retryDb)

let nextCheckMs = 0
const retryAfter = new Map<string, number>()
const failures = new Map<string, number>()

export const contentDetectionEnabled = () => readEnv('WORKER_CONTENT_DETECTION') !== '0'

async function transcribeSlice(target: ContentTarget, slice: { startSec: number, durationSec: number }) {
  const audioUrl = await getVodAudioPlaylistUrl(target.twitchVodId)
  const wav = join(tmpdir(), `clippeak-content-${randomUUID()}.wav`)
  const started = Date.now()
  try {
    await extractAudioWindow(audioUrl, slice.startSec, slice.durationSec, wav, { timeoutMs: 10 * 60_000 })
    const apiKey = readEnv('GROQ_API_KEY')
    const { result, provider } = await transcribeAuto(wav, {
      remote: apiKey ? path => transcribeRemote(path, { apiKey }) : null,
      local: path => transcribeWav(path, { timeoutMs: 20 * 60_000 }),
      onFallback: error => console.warn('[worker] transcription externe en echec, Whisper local pour cette tranche :', error instanceof Error ? error.message : error)
    })
    const segments: TranscriptSegment[] = result.segments
      .filter(s => s.text.trim())
      .map(s => ({
        start: slice.startSec + s.start,
        end: slice.startSec + s.end,
        text: s.text.trim(),
        words: s.words?.map(w => ({ start: slice.startSec + w.start, end: slice.startSec + w.end, text: w.text }))
      }))
    return { segments, provider, workSec: (Date.now() - started) / 1000 }
  } finally {
    await unlink(wav).catch(() => {})
  }
}

// Ce que Claude sait du streamer : sujets et categories de ses clips, titres de ses clips de reference.
async function styleNotes(channelId: string, bank: Awaited<ReturnType<typeof loadReferenceBank>>): Promise<string> {
  const profile = buildReferenceProfile(await pipeline.referenceClips(channelId))
  const parts: string[] = []
  if (profile.topics.length) parts.push(`sujets frequents : ${profile.topics.slice(0, 8).join(', ')}`)
  if (profile.categories.length) parts.push(`categories : ${profile.categories.slice(0, 5).map((c: any) => c.name ?? c).join(', ')}`)
  const titles = bank ? [...bank.titles.values()].slice(0, 8) : []
  if (titles.length) parts.push(`titres de ses clips de reference : ${titles.map(t => `« ${t} »`).join(', ')}`)
  return parts.join(' ; ').slice(0, 900)
}

async function chatPeaksFor(target: ContentTarget, fromSec: number): Promise<ChatPeak[]> {
  if (!usesChat(target.mode)) return []
  try {
    const { messages } = await fetchVodChat(target.twitchVodId, { delayMs: 150, startOffsetSec: Math.max(0, Math.floor(fromSec)) })
    return detectChatPeaks(messages, target.keywords.length ? { keywords: target.keywords } : {})
  } catch (error) {
    // Le chat n'est qu'un bonus : une lecture impossible ne bloque jamais la detection.
    console.warn(`[worker] chat illisible pour la VOD ${target.twitchVodId}, detection sans bonus de chat`, error instanceof Error ? error.message : error)
    return []
  }
}

async function detect(target: ContentTarget, upToSec: number) {
  const apiKey = readEnv('ANTHROPIC_API_KEY')
  if (!apiKey) throw new LongLlmError('La détection par le contenu n’est pas configurée sur ce serveur (clé Claude absente).', false)

  const segments = await store.segments(target.vodId)
  const fromSec = Math.max(0, target.detectedSec - WINDOW_OVERLAP_SEC)
  const bank = await loadReferenceBank(target.channelId)
  const find = createContentFinder({ apiKey, model: readEnv('CLIPPEAK_LLM_MODEL') || undefined, styleNotes: await styleNotes(target.channelId, bank) })

  const found: ContentCandidate[] = []
  for (const window of buildWindows(segments, fromSec, upToSec)) found.push(...await find(window))

  const existing = await pipeline.existingPeaks(target.vodId)
  const chosen = selectContentMoments(found, segments, { max: 4, existingPeaks: existing })
  const peaks = chosen.length ? await chatPeaksFor(target, chosen[0]!.startSec - 60) : []
  const profile = buildReferenceProfile(await pipeline.referenceClips(target.channelId))

  const moments = chosen.map((c) => {
    const text = segments.filter(s => s.end > c.startSec && s.start < c.endSec).map(s => s.text).join(' ')
    // Meme comparaison avec les clips de reference que pour les pics de chat (categories qui marchent, ressemblance aux transcriptions).
    const rated = rateAgainstReference(c.score, c.category, text, profile)
    const similar = bank ? rateBySimilarity(rated.adjustedScore, text, bank.corpus, bank.titles) : null
    return toAnalyzedMoment(c, segments, { peaks, similarityScore: similar?.score ?? rated.adjustedScore, similarityNote: similar?.note })
  }).filter(m => m.score.score >= 5)

  const saved = moments.length ? await pipeline.saveAnalysis(target.vodId, moments, 4) : { moments: 0, queued: 0 }
  await store.markDetected(target.vodId, upToSec)
  console.info(`[worker] detection par le contenu, VOD ${target.twitchVodId} (jusqu'a ${Math.round(upToSec / 60)} min)`, { found: found.length, chat: peaks.length, ...saved })

  // VOD terminee : les extraits sources des nouveaux moments sont recuperes tout de suite (pendant le direct, l'analyse de fin de live s'en charge).
  if (!target.live && saved.moments) {
    try {
      if (await saveSources({ id: target.vodId, twitchVodId: target.twitchVodId })) await pipeline.markSourcesSaved(target.vodId)
    } catch (error) {
      console.warn(`[worker] extraits sources de la VOD ${target.twitchVodId} : nouvel essai plus tard`, error instanceof Error ? error.message : error)
    }
  }
}

async function handleFailure(target: ContentTarget, error: unknown) {
  // VOD privee ou supprimee : inutile de reessayer.
  if (error instanceof VodPlaylistError && (error.kind === 'restricted' || error.kind === 'token')) {
    await store.fail(target.vodId, describeVodError(error)).catch(() => {})
    retryAfter.set(target.vodId, Date.now() + 6 * 3600_000)
    return
  }
  const count = (failures.get(target.vodId) ?? 0) + 1
  failures.set(target.vodId, count)
  const message = error instanceof Error ? error.message : 'Erreur inconnue'
  console.error(`[worker] detection par le contenu en echec pour la VOD ${target.twitchVodId} (${count}/${MAX_FAILURES})`, message)
  const fatal = error instanceof LongLlmError && !error.retryable
  if (count >= MAX_FAILURES || fatal) {
    await store.fail(target.vodId, message).catch(() => {})
    failures.delete(target.vodId)
    retryAfter.set(target.vodId, Date.now() + 6 * 3600_000)
  } else {
    retryAfter.set(target.vodId, Date.now() + RETRY_MS)
  }
}

// Renvoie true si le worker a travaille (une tranche transcrite, ou une lecture par Claude).
export async function contentDetectionStep(): Promise<boolean> {
  if (!contentDetectionEnabled()) return false
  const nowMs = Date.now()
  if (nowMs < nextCheckMs) return false

  for (const target of await store.targets()) {
    if ((retryAfter.get(target.vodId) ?? 0) > nowMs) continue
    const limitSec = target.live ? (nowMs - target.startedAt.getTime()) / 1000 - LIVE_SAFETY_SEC : (target.durationSec ?? 0)
    const slice = target.secLeft > 0 ? nextSlice({ scanSec: target.transcribedSec, limitSec, final: !target.live }, SLICE_SEC) : null
    // Tout le live est transcrit (VOD terminee) : apres la derniere lecture par Claude, c'est fini.
    const allTranscribed = !target.live && target.durationSec !== null && target.transcribedSec >= target.durationSec - 10

    try {
      if (shouldDetect({ transcribedSec: target.transcribedSec, detectedSec: target.detectedSec, finished: !target.live && !slice })) {
        await detect(target, target.transcribedSec)
        if (allTranscribed) await store.markDone(target.vodId)
        failures.delete(target.vodId)
        return true
      }
      if (allTranscribed) {
        await store.markDone(target.vodId)
        continue
      }
      if (!slice) continue
      const audioSec = slice.durationSec
      const { segments, provider, workSec } = await transcribeSlice(target, slice)
      await store.appendSlice(target, { startSec: slice.startSec, endSec: slice.startSec + slice.durationSec, audioSec, workSec, provider }, segments)
      failures.delete(target.vodId)
    } catch (error) {
      await handleFailure(target, error)
    }
    return true
  }
  // Rien a lire : on ne relit la liste des lives qu'une fois par minute.
  nextCheckMs = Date.now() + 60_000
  return false
}
