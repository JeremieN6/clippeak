import { prisma } from '../utils/prisma'
import { retrying } from '../utils/clipping/dbRetry'
import { createPrismaMarkerStore } from '../utils/clipping/prismaMarkerStore'
import { scanMarkers } from '../utils/clipping/markerScan'
import { fetchVodChat } from '../utils/clipping/twitchChat'
import { readEnv } from '../utils/env'

const store = retrying(createPrismaMarkerStore(prisma), { onRetry: (error, attempt) => console.warn(`[worker] base injoignable (tentative ${attempt}), nouvel essai`) })

// Pendant un live, le chat est relu toutes les 2 minutes au plus ; un live termine est lu une fois jusqu'au bout.
const LIVE_EVERY_MS = 2 * 60_000
const RETRY_MS = 10 * 60_000

let nextCheckMs = 0
const lastRun = new Map<string, number>()
const retryAfter = new Map<string, number>()

// Lit les commandes d'extrait long (!extrait / !fin par defaut) tapees dans le chat par le streamer et cree les propositions.
// Desactivable : WORKER_LONG_MARKERS=0. Renvoie true si un live a ete lu.
export async function markersStep(): Promise<boolean> {
  if (readEnv('WORKER_LONG_MARKERS') === '0') return false
  const nowMs = Date.now()
  if (nowMs < nextCheckMs) return false

  for (const target of await store.targets()) {
    if ((retryAfter.get(target.id) ?? 0) > nowMs) continue
    if (target.live && nowMs - (lastRun.get(target.id) ?? 0) < LIVE_EVERY_MS) continue
    lastRun.set(target.id, nowMs)
    try {
      const result = await scanMarkers(target, { store, fetchChat: async (vodId, startOffsetSec) => (await fetchVodChat(vodId, { delayMs: 150, startOffsetSec })).messages })
      if (result.created) console.info(`[worker] reperes d'extrait long : ${result.created} proposition(s) pour la VOD ${target.twitchVodId}`)
    } catch (error) {
      console.error(`[worker] lecture des reperes en echec pour la VOD ${target.twitchVodId}`, error instanceof Error ? error.message : error)
      retryAfter.set(target.id, Date.now() + RETRY_MS)
    }
    return true
  }
  // Rien a lire : on ne relit la liste qu'une fois par minute.
  nextCheckMs = Date.now() + 60_000
  return false
}
