import { readEnv } from '../utils/env'
import { prisma } from '../utils/prisma'
import { createPipelineStore } from '../utils/clipping/prismaPipelineStore'
import { retrying } from '../utils/clipping/dbRetry'
import { dataDir, safeResolve } from '../utils/clipping/dataDir'
import { notifiersFromEnv } from '../utils/clipping/notifier'
import type { Notifier } from '../utils/clipping/notifier'

const store = retrying(createPipelineStore(prisma), { onRetry: (error, attempt) => console.warn(`[worker] base injoignable (tentative ${attempt}), nouvel essai`) })

let loaded: Notifier[] | null = null
const lastAttempt = new Map<number, number>()
const RETRY_AFTER_MS = 10 * 60_000

function notifiers(): Notifier[] {
  if (loaded) return loaded
  const { notifiers: list, problems } = notifiersFromEnv(readEnv)
  for (const problem of problems) console.error(`[worker] notifications : ${problem}`)
  if (!list.length) console.info('[worker] notifications desactivees (ni DISCORD_WEBHOOK_URL ni TELEGRAM_BOT_TOKEN configures) : les lots sont visibles dans /studio')
  loaded = list
  return loaded
}

// Message court a l'admin (Telegram / Discord) : une VOD attend d'etre rendue publique, etc. Sans canal configure : rien n'est envoye.
export async function sendAdminMessage(text: string): Promise<boolean> {
  let sent = false
  for (const notifier of notifiers()) {
    try {
      await notifier.sendText(text)
      sent = true
    } catch (error) {
      console.error(`[worker] message ${notifier.name} en echec : ${error instanceof Error ? error.message : 'erreur'}`)
    }
  }
  return sent
}

// Envoie chaque lot pret (plus aucun clip en file ni en rendu) sur Discord et/ou Telegram, une seule fois par clip.
// Sans notifieur configure, aucune requete n'est faite (Neon peut rester en veille).
export async function notifyStep(): Promise<boolean> {
  const list = notifiers()
  if (!list.length) return false

  const studioUrl = `${(readEnv('CLIPPEAK_PUBLIC_URL') || 'https://clippeak.sassify.fr').replace(/\/+$/, '')}/studio`
  let sent = false
  for (const batch of await store.findBatchesToNotify()) {
    if (Date.now() - (lastAttempt.get(batch.batch) ?? 0) < RETRY_AFTER_MS) continue
    lastAttempt.set(batch.batch, Date.now())

    const notification = {
      batch: batch.batch,
      studioUrl,
      clips: batch.clips.map(c => ({ id: c.id, title: c.title, caption: c.caption, score: c.score, videoPath: safeResolve(dataDir(), c.outputPath) }))
    }
    let delivered = 0
    for (const notifier of list) {
      try {
        await notifier.send(notification)
        delivered++
      } catch (error) {
        console.error(`[worker] notification ${notifier.name} du lot ${batch.batch} en echec : ${error instanceof Error ? error.message : 'erreur'}`)
      }
    }
    if (delivered > 0) {
      await store.markNotified(batch.clips.map(c => c.id))
      console.info(`[worker] lot ${batch.batch} notifie (${delivered}/${list.length} canal)`)
      sent = true
    }
  }
  return sent
}
