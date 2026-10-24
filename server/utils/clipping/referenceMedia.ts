import { readFile, unlink } from 'node:fs/promises'
import { runFfmpeg } from './ffmpegRunner.ts'
import type { RunFfmpegOptions } from './ffmpegRunner.ts'
import type { AnalysisFrame } from './referenceAnalysis.ts'
import { frameTimestamps } from './referencePipeline.ts'

// Duree maximale analysee d'un clip de reference : au-dela, seul le debut compte (un clip vertical dure moins de 3 minutes).
export const MAX_ANALYZED_SEC = 180

// Le fichier peut venir d'un depot ou d'un site tiers : ffmpeg ne doit lire que des fichiers locaux (pas de reseau, pas de concat).
const LOCAL_ONLY = ['-protocol_whitelist', 'file']

export function parseDuration(stderr: string): number | null {
  const match = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr)
  if (!match) return null
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 10) / 10 : null
}

export function audioArgs(videoPath: string, wavPath: string): string[] {
  return [...LOCAL_ONLY, '-i', videoPath, '-t', String(MAX_ANALYZED_SEC), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wavPath]
}

export function frameArgs(videoPath: string, atSec: number, outPath: string): string[] {
  // -ss avant -i : saut rapide ; 512 px de large suffisent a Claude et gardent l'image legere.
  return [...LOCAL_ONLY, '-ss', String(atSec), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=512:-2', '-q:v', '5', outPath]
}

export async function probeDuration(videoPath: string, options: RunFfmpegOptions = {}): Promise<number | null> {
  try {
    return parseDuration(await runFfmpeg([...LOCAL_ONLY, '-i', videoPath, '-f', 'null', '-t', '0.1', '-'], { timeoutMs: 60_000, ...options }))
  } catch (error) {
    // ffmpeg sort en erreur si la sortie est vide, mais la duree est deja dans stderr.
    const tail = (error as { stderrTail?: string }).stderrTail
    return tail ? parseDuration(tail) : null
  }
}

export function extractReferenceAudio(videoPath: string, wavPath: string, options: RunFfmpegOptions = {}): Promise<void> {
  return runFfmpeg(audioArgs(videoPath, wavPath), { timeoutMs: 120_000, ...options }).then(() => undefined)
}

export async function extractReferenceFrames(
  videoPath: string,
  durationSec: number | null,
  tempPath: (index: number) => string,
  options: RunFfmpegOptions = {}
): Promise<AnalysisFrame[]> {
  const limit = Math.min(durationSec ?? MAX_ANALYZED_SEC, MAX_ANALYZED_SEC)
  const frames: AnalysisFrame[] = []
  for (const [index, atSec] of frameTimestamps(limit).entries()) {
    const out = tempPath(index)
    try {
      await runFfmpeg(frameArgs(videoPath, atSec, out), { timeoutMs: 60_000, ...options })
      frames.push({ base64: (await readFile(out)).toString('base64'), atSec })
    } catch {
      // Une image manquante n'empeche pas l'analyse : on garde celles qui ont reussi.
    } finally {
      await unlink(out).catch(() => {})
    }
  }
  return frames
}
