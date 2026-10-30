import { prisma } from '../utils/prisma'
import { batchNotes } from '../utils/clipping/bellBatches'

// Cloche du studio : « Ton lot N est pret » pour chaque chaine, des que plus aucun clip du lot n'est en file ni en rendu et qu'au moins
// un attend la validation. Independant de Discord / Telegram (qui vont chez l'admin) : le streamer est prevenu dans l'outil.
// Une seule notification par chaine et par lot (le titre porte le numero). Limite a une passe par minute.
let lastRun = 0

export async function bellStep(): Promise<boolean> {
  if (Date.now() - lastRun < 60_000) return false
  lastRun = Date.now()
  const jobs = await prisma.clipJob.findMany({
    where: { batch: { not: null }, createdAt: { gte: new Date(Date.now() - 14 * 24 * 3600 * 1000) } },
    select: { batch: true, status: true, moment: { select: { vod: { select: { channelId: true } } } } }
  })
  const ready = batchNotes(jobs.map(j => ({ channelId: j.moment.vod.channelId, batch: j.batch as number, status: j.status })))
  let sent = false
  for (const b of ready) {
    const title = `Ton lot ${b.batch} est prêt`
    if (await prisma.notification.findFirst({ where: { channelId: b.channelId, kind: 'batch_ready', title }, select: { id: true } })) continue
    await prisma.notification.create({ data: { channelId: b.channelId, kind: 'batch_ready', title, body: `${b.ready} clip${b.ready > 1 ? 's' : ''} ${b.ready > 1 ? 'attendent' : 'attend'} ta validation. Rien n’est publié sans toi.` } })
    console.info(`[worker] cloche : lot ${b.batch} prêt pour la chaîne ${b.channelId}`)
    sent = true
  }
  return sent
}
