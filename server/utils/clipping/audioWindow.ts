import { runFfmpeg } from './ffmpegRunner.ts'
import type { RunFfmpegOptions } from './ffmpegRunner.ts'

// Arguments ffmpeg pour extraire une fenetre d'une playlist HLS en WAV 16 kHz mono (format attendu par transcribe.py).
// -ss avant -i : ffmpeg saute directement au bon segment HLS au lieu de tout telecharger.
export function audioWindowArgs(playlistUrl: string, startSec: number, durationSec: number, outPath: string): string[] {
  return [
    '-ss', String(Math.max(0, Math.floor(startSec))),
    '-t', String(Math.ceil(durationSec)),
    '-i', playlistUrl,
    '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
    outPath
  ]
}

export function extractAudioWindow(
  playlistUrl: string,
  startSec: number,
  durationSec: number,
  outPath: string,
  options: RunFfmpegOptions = {}
): Promise<void> {
  return runFfmpeg(audioWindowArgs(playlistUrl, startSec, durationSec, outPath), { timeoutMs: 120_000, ...options })
}
