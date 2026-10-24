import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readEnv } from '../utils/env'
import { prisma } from '../utils/prisma'
import { createPipelineStore } from '../utils/clipping/prismaPipelineStore'
import type { ScanTarget } from '../utils/clipping/prismaPipelineStore'
import { retrying } from '../utils/clipping/dbRetry'
import { getVodAudioPlaylistUrl } from '../utils/clipping/vodPlaylist'
import { extractAudioWindow } from '../utils/clipping/audioWindow'
import { transcribeWav } from '../utils/clipping/whisperTranscribe'
import { rateBySimilarity } from '../utils/clipping/referenceSimilarity'
import { findSimilarWindows, nextSlice, windowToCandidate } from '../utils/clipping/similarityScan'
import type { AnalyzedMoment } from '../utils/clipping/vodAnalysis'
import { createScorer, loadReferenceBank } from './analysis'

const store = retrying(createPipelineStore(prisma), { onRetry: (error, attempt) => console.warn(`[worker] base injoignable (tentative ${attempt}), nouvel essai`) })

const SLICE_SEC = 300
// Pendant le live, on reste en retrait : l'audio de la tranche doit etre entierement disponible.
const LIVE_SAFETY_SEC = 120
const MIN_SCORE = 5

let nextCheckMs = 0
const retryAfter = new Map<string, number>()

async function scanSlice(target: ScanTarget, slice: { startSec: number, durationSec: number, newFromSec: number }): Promise<'done' | 'no_bank'> {
  const bank = await loadReferenceBank(target.channelId)
  if (!bank) return 'no_bank'

  const audioUrl = await getVodAudioPlaylistUrl(target.twitchVodId)
  const wav = join(tmpdir(), `clippeak-scan-${randomUUID()}.wav`)
  let segments
  try {
    await extractAudioWindow(audioUrl, slice.startSec, slice.durationSec, wav)
    const result = await transcribeWav(wav)
    segments = result.segments
      .filter(s => s.text.trim())
      .map(s => ({
        start: slice.startSec + s.start,
        end: slice.startSec + s.end,
        text: s.text.trim(),
        words: s.words?.map(w => ({ start: slice.startSec + w.start, end: slice.startSec + w.end, text: w.text }))
      }))
  } finally {
    await unlink(wav).catch(() => {})
  }

  const existing = await store.existingPeaks(target.id)
  const windows = findSimilarWindows(segments, bank.corpus, { exclude: existing, max: target.live ? 2 : 3 })
    .filter(w => w.endSec > slice.newFromSec)

  const scorer = createScorer()
  const moments: AnalyzedMoment[] = []
  for (const window of windows) {
    const candidate = windowToCandidate(window, segments)
    const base = await scorer.score(candidate)
    const rated = rateBySimilarity(base.score, window.text, bank.corpus, bank.titles)
    if (rated.score < MIN_SCORE) continue
    moments.push({
      ...candidate,
      score: { ...base, score: rated.score, rationale: `detecte par ressemblance avec les clips de reference (pas par le chat) : ${rated.note || 'passage proche'}`.slice(0, 500) }
    })
  }
  if (moments.length) {
    const saved = await store.saveAnalysis(target.id, moments, 4)
    console.info(`[worker] balayage par ressemblance VOD ${target.twitchVodId} (${Math.round(slice.newFromSec / 60)} min)`, saved)
  }
  await store.setScanSec(target.id, slice.startSec + slice.durationSec)
  return 'done'
}

// Cherche dans la parole du live (ou de la VOD terminee) les passages qui ressemblent aux clips de reference, sans le chat :
// tranches de 5 min transcrites une a une, avancement garde en base (vods.scan_sec). Desactivable : WORKER_SIMILARITY_SCAN=0.
// Renvoie true si une tranche a ete traitee.
export async function similarityScanStep(): Promise<boolean> {
  if (readEnv('WORKER_SIMILARITY_SCAN') === '0') return false
  const nowMs = Date.now()
  if (nowMs < nextCheckMs) return false

  for (const target of await store.vodsToScan()) {
    if ((retryAfter.get(target.id) ?? 0) > nowMs) continue
    const limitSec = target.live
      ? (nowMs - target.startedAt.getTime()) / 1000 - LIVE_SAFETY_SEC
      : (target.durationSec ?? 0)
    const slice = nextSlice({ scanSec: target.scanSec, limitSec, final: !target.live }, SLICE_SEC)
    if (!slice) continue
    try {
      if (await scanSlice(target, slice) === 'no_bank') {
        // Banque de reference vide pour ce streamer : inutile de relire la base a chaque passage.
        nextCheckMs = Date.now() + 10 * 60_000
        return false
      }
    } catch (error) {
      console.error(`[worker] balayage par ressemblance en echec pour la VOD ${target.twitchVodId}`, error)
      retryAfter.set(target.id, Date.now() + 10 * 60_000)
    }
    return true
  }
  // Rien a balayer : on ne relit la liste des VODs qu'une fois par minute.
  nextCheckMs = Date.now() + 60_000
  return false
}
