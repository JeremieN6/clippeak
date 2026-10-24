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
  // Pics (temps de VOD) deja traites par une analyse precedente (pendant le live) : on n'y revient pas.
  existingPeaks?: number[]
  // Analyse pendant le live : un pic n'est exploitable que si sa reaction est terminee et que l'audio de la fenetre
  // (jusqu'a 20 s apres le pic) existe deja.
  maxPeakSec?: number
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
  const existing = options.existingPeaks ?? []

  const messages = await deps.fetchChat()
  const peaks = deps.detectPeaks(messages, options.keywords)
    .filter(p => options.maxPeakSec === undefined || p.peakSec <= options.maxPeakSec)
    .filter(p => existing.every(e => Math.abs(e - p.peakSec) >= minGap))
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

// Etat d'une VOD suivie pendant le live (en memoire du worker) et decision de relancer une analyse.
export interface LiveState {
  lastRunMs: number
}

export function shouldRunLiveAnalysis(
  state: LiveState | undefined,
  nowMs: number,
  startedAtMs: number | null,
  options: { intervalSec: number, minStreamSec: number }
): boolean {
  // Pas assez de direct pour qu'il y ait un chat exploitable.
  if (startedAtMs !== null && nowMs - startedAtMs < options.minStreamSec * 1000) return false
  if (!state) return true
  return nowMs - state.lastRunMs >= options.intervalSec * 1000
}

// Fenetre de chat relue a chaque passage pendant le live : les dernieres `windowSec` secondes du direct
// (le calcul de pics garde ainsi une base de comparaison recente sans relire des heures de chat).
export function liveWindowStart(streamElapsedSec: number, windowSec: number): number {
  return Math.max(0, Math.floor(streamElapsedSec - windowSec))
}
