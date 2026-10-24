import { similarity } from './referenceSimilarity.ts'
import type { Corpus } from './referenceSimilarity.ts'
import type { ChatPeak } from './chatPeaks.ts'
import type { PeakTranscript } from './peakTranscript.ts'
import type { TranscriptSegment } from './whisperTranscribe.ts'

export interface ScanOptions {
  // Longueur maximale d'une fenetre candidate (un clip dure 20 a 60 s).
  windowSec?: number
  minWindowSec?: number
  minWords?: number
  // Ressemblance minimale (0..1) pour proposer un moment : nettement au-dessus du bruit (0,08).
  minSimilarity?: number
  minGapSec?: number
  max?: number
  // Instants (temps de VOD) deja couverts par un moment : on n'y revient pas.
  exclude?: number[]
}

export interface SimilarWindow {
  startSec: number
  endSec: number
  text: string
  similarity: number
  matchId: string
  sharedTerms: string[]
  segments: TranscriptSegment[]
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length

// Cherche, dans la transcription d'une tranche de live ou de VOD, les passages qui ressemblent aux clips de reference.
// Fenetres glissantes de phrases (terminees a la fin d'un segment), les plus ressemblantes d'abord, jamais deux
// passages a moins de minGapSec l'un de l'autre.
export function findSimilarWindows(segments: TranscriptSegment[], corpus: Corpus, options: ScanOptions = {}): SimilarWindow[] {
  const windowSec = options.windowSec ?? 45
  const minWindowSec = options.minWindowSec ?? 12
  const minWords = options.minWords ?? 25
  const minSimilarity = options.minSimilarity ?? 0.2
  const minGap = options.minGapSec ?? 90
  const exclude = options.exclude ?? []
  const spoken = segments.filter(s => s.text.trim() && s.end > s.start)

  const windows: SimilarWindow[] = []
  for (let end = 0; end < spoken.length; end++) {
    let start = end
    while (start > 0 && spoken[end].end - spoken[start - 1].start <= windowSec) start--
    const part = spoken.slice(start, end + 1)
    const startSec = part[0].start
    const endSec = part[part.length - 1].end
    const text = part.map(s => s.text.trim()).join(' ')
    if (endSec - startSec < minWindowSec || wordCount(text) < minWords) continue
    const result = similarity(text, corpus, 1)
    const top = result.matches[0]
    if (!top || result.best < minSimilarity) continue
    windows.push({ startSec, endSec, text, similarity: result.best, matchId: top.id, sharedTerms: top.sharedTerms, segments: part })
  }

  const chosen: SimilarWindow[] = []
  for (const window of windows.sort((a, b) => b.similarity - a.similarity)) {
    if (chosen.length >= (options.max ?? 3)) break
    const clash = (other: number) => Math.abs(other - window.endSec) < minGap
    if (chosen.some(c => clash(c.endSec)) || exclude.some(clash)) continue
    chosen.push(window)
  }
  return chosen.sort((a, b) => a.startSec - b.startSec)
}

// Un passage similaire, presente comme un "pic" pour le reste du pipeline (coupe, note, rendu) : sans chat, la chute
// est la fin du passage ; les phrases qui suivent (20 s) restent disponibles pour finir proprement le clip.
export function windowToCandidate(window: SimilarWindow, all: TranscriptSegment[], contextAfterSec = 20): { peak: ChatPeak, transcript: PeakTranscript } {
  const peak: ChatPeak = {
    startSec: window.startSec,
    endSec: window.endSec + 5,
    peakSec: window.endSec,
    // Ressemblance 0,2 -> 4/10, 0,5 -> 10/10 : sert de repere de depart a la note finale.
    score: Math.round(Math.min(10, window.similarity * 20) * 10) / 10,
    signals: { messages: 0, rateZ: 0, keywordShare: 0, capsShare: 0 }
  }
  const segments = all.filter(s => s.end > window.startSec - 5 && s.start < window.endSec + contextAfterSec)
  return {
    peak,
    transcript: {
      windowStartSec: segments[0]?.start ?? window.startSec,
      windowDurationSec: Math.ceil(window.endSec + contextAfterSec - (segments[0]?.start ?? window.startSec)),
      segments,
      beforePeak: window.text,
      transcribeSec: 0
    }
  }
}

export interface SliceState {
  scanSec: number
  // Duree de VOD exploitable (fin du direct moins une marge, ou duree totale d'une VOD terminee).
  limitSec: number
  // VOD terminee : la derniere tranche peut etre plus courte. Pendant le live, on attend une tranche entiere.
  final: boolean
}

// Tranche suivante a transcrire (avec un recul de lookbackSec pour ne pas couper une phrase a la jonction) ; null s'il n'y a rien a faire.
export function nextSlice(state: SliceState, sliceSec = 300, lookbackSec = 30): { startSec: number, durationSec: number, newFromSec: number } | null {
  const available = state.limitSec - state.scanSec
  if (available < 10 || (!state.final && available < sliceSec)) return null
  const startSec = Math.max(0, state.scanSec - lookbackSec)
  const length = Math.floor(Math.min(sliceSec, available))
  return { startSec, durationSec: Math.floor(state.scanSec - startSec) + length, newFromSec: state.scanSec }
}
