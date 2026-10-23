import type { TranscriptResult, TranscriptSegment } from './whisperTranscribe.ts'

export interface PeakRef {
  startSec: number
  endSec: number
  peakSec: number
}

export interface PeakTranscript {
  windowStartSec: number
  windowDurationSec: number
  // Segments en temps de VOD (decalage de la fenetre deja applique).
  segments: TranscriptSegment[]
  // Ce que dit le streamer juste avant le pic : de quoi juger l'histoire, l'avis ou la punchline.
  beforePeak: string
  transcribeSec: number
}

export interface PeakTranscriptDeps {
  extractWindow: (startSec: number, durationSec: number, wavPath: string) => Promise<void>
  transcribe: (wavPath: string) => Promise<TranscriptResult>
  tempWavPath: () => string
  removeFile: (path: string) => Promise<void>
}

// ~60 s autour du pic, davantage avant qu'apres : l'accroche se dit AVANT que le chat reagisse.
export function windowForPeak(peak: PeakRef, beforeSec = 45, afterSec = 15): { startSec: number, durationSec: number } {
  const startSec = Math.max(0, Math.floor(peak.peakSec - beforeSec))
  return { startSec, durationSec: Math.ceil(peak.peakSec + afterSec - startSec) }
}

export async function transcribePeak(peak: PeakRef, deps: PeakTranscriptDeps): Promise<PeakTranscript> {
  const window = windowForPeak(peak)
  const wavPath = deps.tempWavPath()
  try {
    await deps.extractWindow(window.startSec, window.durationSec, wavPath)
    const result = await deps.transcribe(wavPath)
    const segments = result.segments
      .filter(s => s.text.trim())
      .map(s => ({ start: window.startSec + s.start, end: window.startSec + s.end, text: s.text.trim() }))
    const beforePeak = segments.filter(s => s.start < peak.peakSec).map(s => s.text).join(' ')
    return {
      windowStartSec: window.startSec,
      windowDurationSec: window.durationSec,
      segments,
      beforePeak,
      transcribeSec: result.transcribeSec
    }
  } finally {
    await deps.removeFile(wavPath).catch(() => {})
  }
}
