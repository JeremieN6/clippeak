import { readEnv } from '../utils/env'
import { prisma } from '../utils/prisma'
import { createPipelineStore } from '../utils/clipping/prismaPipelineStore'
import { retrying } from '../utils/clipping/dbRetry'
import { checkVodReadable } from '../utils/clipping/vodAccess'
import { purgeOldSources } from '../utils/clipping/sourceExtract'
import { dataDir } from '../utils/clipping/dataDir'
import { sendAdminMessage } from './notify'

const store = retrying(createPipelineStore(prisma), { onRetry: (error, attempt) => console.warn(`[worker] base injoignable (tentative ${attempt}), nouvel essai`) })

const RECHECK_EVERY_MS = 3 * 60_000
const lastCheck = new Map<string, number>()

// VODs reservees aux abonnes en attente : toutes les 3 minutes, on regarde si Twitch les laisse enfin lire. Des que c'est le cas, elles
// repartent en analyse (statut « ended »). Renvoie true quand une VOD vient d'etre debloquee.
export async function vodAccessStep(): Promise<boolean> {
  const blocked = await store.listBlockedVods()
  for (const vod of blocked) {
    if (Date.now() - (lastCheck.get(vod.id) ?? 0) < RECHECK_EVERY_MS) continue
    lastCheck.set(vod.id, Date.now())
    const access = await checkVodReadable(vod.twitchVodId, fetch, { gql: readEnv('TWITCH_GQL_URL') || undefined, usher: readEnv('TWITCH_USHER_URL') || undefined })
    if (access.state !== 'readable') continue
    await store.setVodStatus(vod.id, 'ended')
    console.info(`[worker] VOD ${vod.twitchVodId} maintenant lisible : analyse relancee`)
    await sendAdminMessage(`▶️ VOD de ${vod.channelName} (${vod.twitchVodId}) rendue publique : analyse en cours.`)
    return true
  }
  return false
}

let lastPurge = 0

// Nettoyage des extraits de plus de 14 jours (une fois toutes les 6 h, sans toucher a la base). Ne fait jamais « un travail » : renvoie false.
export async function purgeSourcesStep(): Promise<boolean> {
  if (Date.now() - lastPurge < 6 * 3600_000) return false
  lastPurge = Date.now()
  const removed = await purgeOldSources(dataDir())
  if (removed) console.info(`[worker] ${removed} dossier(s) d'extraits supprime(s) (plus de 14 jours)`)
  return false
}
