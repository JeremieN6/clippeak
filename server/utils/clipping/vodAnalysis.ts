import type { ChatMessage, ChatPeak } from './chatPeaks.ts'
import type { PeakTranscript } from './peakTranscript.ts'
import type { MomentScore } from './momentScoring.ts'

export interface AnalyzedMoment {
  peak: ChatPeak
  transcript: PeakTranscript
  score: MomentScore
}

export interface AnalysisOptions {
  keywords: string[]
  maxMoments?: number
  // Note minimale (sur 10) pour garder un moment apres notation.
  minScore?: number
  // Ecart minimal entre deux moments retenus (evite deux clips du meme passage).
  minGapSec?: number
}

export interface AnalysisDeps {
  fetchChat: () => Promise<ChatMessage[]>
  detectPeaks: (messages: ChatMessage[], keywords: string[]) => ChatPeak[]
  transcribePeak: (peak: ChatPeak) => Promise<PeakTranscript>
  score: (candidate: { peak: ChatPeak, transcript: PeakTranscript }) => Promise<MomentScore>
  onError?: (peak: ChatPeak, error: unknown) => void
}

export interface AnalysisResult {
  moments: AnalyzedMoment[]
  peaksFound: number
  // "chat_calm" : aucun pic exploitable, la banque de clips de reference doit prendre le relais.
  reason: 'ok' | 'chat_calm' | 'nothing_kept'
}

// Du chat de la VOD a une liste de moments notes : les pics les plus forts d'abord, un seul par passage,
// transcription uniquement autour de ces pics (jamais de la VOD entiere).
export async function analyzeVod(options: AnalysisOptions, deps: AnalysisDeps): Promise<AnalysisResult> {
  const maxMoments = options.maxMoments ?? 12
  const minScore = options.minScore ?? 5
  const minGap = options.minGapSec ?? 90

  const messages = await deps.fetchChat()
  const peaks = deps.detectPeaks(messages, options.keywords)
  if (!peaks.length) return { moments: [], peaksFound: 0, reason: 'chat_calm' }

  const chosen: ChatPeak[] = []
  for (const peak of [...peaks].sort((a, b) => b.score - a.score)) {
    if (chosen.length >= maxMoments) break
    if (chosen.every(c => Math.abs(c.peakSec - peak.peakSec) >= minGap)) chosen.push(peak)
  }

  const moments: AnalyzedMoment[] = []
  for (const peak of chosen) {
    try {
      const transcript = await deps.transcribePeak(peak)
      const score = await deps.score({ peak, transcript })
      if (score.score >= minScore) moments.push({ peak, transcript, score })
    } catch (error) {
      // Un pic dont l'audio est illisible ne doit pas faire echouer toute la VOD.
      deps.onError?.(peak, error)
    }
  }
  moments.sort((a, b) => b.score.score - a.score.score)
  return { moments, peaksFound: peaks.length, reason: moments.length ? 'ok' : 'nothing_kept' }
}
