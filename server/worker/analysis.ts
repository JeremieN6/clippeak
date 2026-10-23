import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readEnv } from '../utils/env'
import { prisma } from '../utils/prisma'
import { createPipelineStore } from '../utils/clipping/prismaPipelineStore'
import { retrying } from '../utils/clipping/dbRetry'
import { analyzeVod } from '../utils/clipping/vodAnalysis'
import { detectChatPeaks } from '../utils/clipping/chatPeaks'
import { fetchVodChat } from '../utils/clipping/twitchChat'
import { getVodAudioPlaylistUrl } from '../utils/clipping/vodPlaylist'
import { extractAudioWindow } from '../utils/clipping/audioWindow'
import { transcribeWav } from '../utils/clipping/whisperTranscribe'
import { transcribePeak } from '../utils/clipping/peakTranscript'
import { createClaudeScorer, heuristicScorer } from '../utils/clipping/momentScoring'
import { buildReferenceProfile, rateAgainstReference } from '../utils/clipping/referenceClips'

const store = retrying(createPipelineStore(prisma), { onRetry: (error, attempt) => console.warn(`[worker] base injoignable (tentative ${attempt}), nouvel essai`) })

// Analyse une VOD terminee : pics de chat -> transcription autour des pics -> note -> moments + clips en file.
// Renvoie true si une VOD a ete traitee (le worker repart alors sans dormir).
export async function analysisStep(): Promise<boolean> {
  const vod = await store.claimVodToAnalyze()
  if (!vod) return false

  try {
    const audioUrl = await getVodAudioPlaylistUrl(vod.twitchVodId)
    const profile = buildReferenceProfile(await store.referenceClips(vod.channelId))
    const apiKey = readEnv('ANTHROPIC_API_KEY')
    const scorer = apiKey ? createClaudeScorer({ apiKey, model: readEnv('CLIPPEAK_LLM_MODEL') || undefined }) : heuristicScorer

    const result = await analyzeVod({ keywords: vod.keywords }, {
      fetchChat: async () => (await fetchVodChat(vod.twitchVodId, { delayMs: 150 })).messages,
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
        return { ...base, score: rated.adjustedScore }
      },
      onError: (peak, error) => console.error('[worker] pic ignore', peak.peakSec, error)
    })

    if (result.reason === 'chat_calm') console.info(`[worker] chat calme sur la VOD ${vod.twitchVodId} : aucun clip issu du chat`)
    const saved = await store.saveAnalysis(vod.id, result.moments)
    await store.setVodStatus(vod.id, 'done')
    console.info(`[worker] VOD ${vod.twitchVodId} analysee`, { peaks: result.peaksFound, ...saved })
  } catch (error) {
    console.error(`[worker] analyse en echec pour la VOD ${vod.twitchVodId}`, error)
    await store.setVodStatus(vod.id, 'failed').catch(() => {})
  }
  return true
}
