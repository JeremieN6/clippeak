import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readEnv } from '../utils/env'
import { prisma } from '../utils/prisma'
import { createPipelineStore } from '../utils/clipping/prismaPipelineStore'
import type { VodToAnalyze } from '../utils/clipping/prismaPipelineStore'
import { retrying } from '../utils/clipping/dbRetry'
import { analyzeVod, liveWindowStart, shouldRunLiveAnalysis } from '../utils/clipping/vodAnalysis'
import type { LiveState } from '../utils/clipping/vodAnalysis'
import { detectChatPeaks } from '../utils/clipping/chatPeaks'
import { fetchVodChat } from '../utils/clipping/twitchChat'
import { getVodAudioPlaylistUrl } from '../utils/clipping/vodPlaylist'
import { extractAudioWindow } from '../utils/clipping/audioWindow'
import { transcribeWav } from '../utils/clipping/whisperTranscribe'
import { transcribePeak } from '../utils/clipping/peakTranscript'
import { createClaudeScorer, heuristicScorer } from '../utils/clipping/momentScoring'
import { buildReferenceProfile, rateAgainstReference } from '../utils/clipping/referenceClips'
import { buildCorpus, rateBySimilarity } from '../utils/clipping/referenceSimilarity'
import { performanceWeights } from '../utils/clipping/referenceProfile'
import { loadAnalyzedReferences } from '../utils/clipping/prismaReferenceStore'

const store = retrying(createPipelineStore(prisma), { onRetry: (error, attempt) => console.warn(`[worker] base injoignable (tentative ${attempt}), nouvel essai`) })

// Chat relu a chaque passage pendant le live (derniere demi-heure) et marge avant le present : le pic doit etre termine
// et l'audio de sa fenetre (jusqu'a 20 s apres) deja disponible.
const LIVE_WINDOW_SEC = 30 * 60
const LIVE_SAFETY_SEC = 90

// Corpus de ressemblance des clips de reference d'un streamer (transcription non vide uniquement) ; null si la banque est vide.
// Note par l'API Claude si une cle est configuree, sinon note locale.
export function createScorer() {
  const apiKey = readEnv('ANTHROPIC_API_KEY')
  return apiKey ? createClaudeScorer({ apiKey, model: readEnv('CLIPPEAK_LLM_MODEL') || undefined }) : heuristicScorer
}

export async function loadReferenceBank(channelId: string) {
  let items: Awaited<ReturnType<typeof loadAnalyzedReferences>>
  try {
    items = (await loadAnalyzedReferences(prisma, channelId)).filter(item => item.transcript.trim())
  } catch (error) {
    // Table absente (migration pas encore appliquee) ou base injoignable : l'analyse continue sans ressemblance.
    console.warn('[worker] banque de reference illisible, analyse sans ressemblance', error instanceof Error ? error.message : error)
    return null
  }
  if (!items.length) return null
  const weights = performanceWeights(items)
  return {
    corpus: buildCorpus(items.map(item => ({ id: item.id, text: `${item.transcript} ${item.analysis?.keywords.join(' ') ?? ''}`, weight: weights.get(item.id) ?? 1 }))),
    titles: new Map(items.map(item => [item.id, item.title ?? item.analysis?.topic ?? 'un clip de reference'] as const))
  }
}

async function runAnalysis(vod: VodToAnalyze, live: boolean) {
  const audioUrl = await getVodAudioPlaylistUrl(vod.twitchVodId)
  const profile = buildReferenceProfile(await store.referenceClips(vod.channelId))
  const scorer = createScorer()
  const existingPeaks = await store.existingPeaks(vod.id)
  const bank = await loadReferenceBank(vod.channelId)

  const elapsedSec = vod.startedAt ? (Date.now() - vod.startedAt.getTime()) / 1000 : 0
  const result = await analyzeVod({
    keywords: vod.keywords,
    existingPeaks,
    maxMoments: live ? 4 : 12,
    maxPeakSec: live ? elapsedSec - LIVE_SAFETY_SEC : undefined
  }, {
    fetchChat: async () => (await fetchVodChat(vod.twitchVodId, { delayMs: 150, startOffsetSec: live ? liveWindowStart(elapsedSec, LIVE_WINDOW_SEC) : 0 })).messages,
    detectPeaks: (messages, keywords) => detectChatPeaks(messages, keywords.length ? { keywords } : {}),
    transcribePeak: peak => transcribePeak(peak, {
      extractWindow: (start, duration, path) => extractAudioWindow(audioUrl, start, duration, path),
      transcribe: path => transcribeWav(path),
      tempWavPath: () => join(tmpdir(), `clippeak-${randomUUID()}.wav`),
      removeFile: unlink
    }),
    score: async (candidate) => {
      const base = await scorer.score(candidate)
      const rated = rateAgainstReference(base.score, base.category, candidate.transcript.beforePeak, profile)
      // Ressemblance avec les transcriptions des clips de reference analyses (banque importee dans /studio).
      const similar = bank ? rateBySimilarity(rated.adjustedScore, candidate.transcript.segments.map(s => s.text).join(' '), bank.corpus, bank.titles) : null
      return {
        ...base,
        score: similar?.score ?? rated.adjustedScore,
        rationale: similar?.note ? `${base.rationale} ; ${similar.note}`.slice(0, 500) : base.rationale
      }
    },
    onError: (peak, error) => console.error('[worker] pic ignore', peak.peakSec, error)
  })

  if (result.reason === 'chat_calm') console.info(`[worker] chat calme sur la VOD ${vod.twitchVodId} : aucun nouveau clip issu du chat`)
  const saved = await store.saveAnalysis(vod.id, result.moments, live ? 4 : 8)
  console.info(`[worker] VOD ${vod.twitchVodId} analysee${live ? ' pendant le live' : ''}`, { peaks: result.peaksFound, ...saved })
}

// Analyse une VOD terminee : pics de chat -> transcription autour des pics -> note -> moments + clips en file.
// Les pics deja traites pendant le live sont ecartes. Renvoie true si une VOD a ete traitee.
export async function analysisStep(): Promise<boolean> {
  const vod = await store.claimVodToAnalyze()
  if (!vod) return false

  try {
    await runAnalysis(vod, false)
    await store.setVodStatus(vod.id, 'done')
  } catch (error) {
    console.error(`[worker] analyse en echec pour la VOD ${vod.twitchVodId}`, error)
    await store.setVodStatus(vod.id, 'failed').catch(() => {})
  }
  return true
}

const liveStates = new Map<string, LiveState>()

// Analyse par tranches pendant le live (toutes les WORKER_LIVE_INTERVAL_SEC, 5 min par defaut, apres 10 min de direct).
// Desactivable avec WORKER_LIVE_ANALYSIS=0. Le statut de la VOD ne change pas : le reste est traite a la fin du direct.
export async function liveAnalysisStep(): Promise<boolean> {
  if (readEnv('WORKER_LIVE_ANALYSIS') === '0') return false
  const intervalSec = Math.max(60, Number(readEnv('WORKER_LIVE_INTERVAL_SEC')) || 300)

  const vods = await store.listLiveVods()
  for (const id of [...liveStates.keys()]) if (!vods.some(v => v.id === id)) liveStates.delete(id)

  for (const vod of vods) {
    const nowMs = Date.now()
    if (!shouldRunLiveAnalysis(liveStates.get(vod.id), nowMs, vod.startedAt ? vod.startedAt.getTime() : null, { intervalSec, minStreamSec: 600 })) continue
    // L'heure est notee avant le traitement : un echec ne relance pas la meme analyse en boucle.
    liveStates.set(vod.id, { lastRunMs: nowMs })
    try {
      await runAnalysis(vod, true)
    } catch (error) {
      console.error(`[worker] analyse live en echec pour la VOD ${vod.twitchVodId}`, error)
    }
    return true
  }
  return false
}
