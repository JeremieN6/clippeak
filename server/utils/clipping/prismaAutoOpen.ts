import type { PrismaClient } from '@prisma/client'
import { evaluateBatch, type BatchChannel, type BatchHealth } from './batchHealth'
import { loadInvitationConfig, openSlotsTaken } from './prismaWaves'

// Acces base de l'ouverture automatique par lots (regles pures : ./batchHealth.ts). Partage par le worker (qui ouvre) et l'administration (qui montre).
type Db = Pick<PrismaClient, 'invitationSettings' | 'channelInvite' | 'accessRequest' | 'channel' | 'vod' | 'clipJob' | 'opsSample'>

export interface AutoOpenStatus {
  batchSize: number // 0 = ouverture manuelle
  freePlaces: number
  waiting: number
  health: BatchHealth | null
}

// Le dernier lot = les `batchSize` dernieres chaines arrivees par l'inscription libre et deja connectees au moins une fois.
async function lastBatch(db: Db, batchSize: number, now: Date): Promise<BatchChannel[]> {
  const invites = await db.channelInvite.findMany({ where: { source: 'open', twitchId: { not: null } }, orderBy: { createdAt: 'desc' }, take: batchSize, select: { twitchId: true } })
  const twitchIds = invites.map(i => i.twitchId).filter((id): id is string => Boolean(id))
  if (!twitchIds.length) return []
  const channels = await db.channel.findMany({ where: { twitchId: { in: twitchIds } }, select: { id: true } })
  const out: BatchChannel[] = []
  for (const channel of channels) {
    const firstVod = await db.vod.findFirst({ where: { channelId: channel.id }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
    if (!firstVod) { out.push({ ageHours: null, firstClipHours: null }); continue }
    const firstClip = await db.clipJob.findFirst({ where: { renderedAt: { not: null }, status: { in: ['review', 'approved', 'rejected'] }, moment: { vod: { channelId: channel.id } } }, orderBy: { renderedAt: 'asc' }, select: { renderedAt: true } })
    const hours = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 3_600_000
    out.push({ ageHours: hours(now, firstVod.createdAt), firstClipHours: firstClip?.renderedAt ? hours(firstClip.renderedAt, firstVod.createdAt) : null })
  }
  return out
}

export async function autoOpenStatus(db: Db, now: Date = new Date()): Promise<AutoOpenStatus> {
  const config = await loadInvitationConfig(db)
  const [taken, waiting] = await Promise.all([openSlotsTaken(db), db.accessRequest.count()])
  const freePlaces = Math.max(0, config.openUntil - taken)
  if (config.autoOpenBatch <= 0) return { batchSize: 0, freePlaces, waiting, health: null }
  const [channels, samples] = await Promise.all([
    lastBatch(db, config.autoOpenBatch, now),
    db.opsSample.findMany({ where: { at: { gte: new Date(now.getTime() - 24 * 3_600_000) } }, orderBy: { at: 'desc' } })
  ])
  return { batchSize: config.autoOpenBatch, freePlaces, waiting, health: evaluateBatch(channels, samples, config.autoOpenBatch) }
}

export interface AutoOpenResult { opened: number, reason: 'off' | 'room' | 'nobody' | BatchHealth['reason'], health: BatchHealth | null }

// Ouvre le lot suivant quand : l'ouverture automatique est reglee, toutes les places sont prises, des gens attendent, et le lot precedent se gere bien.
export async function runAutoOpen(db: Db, now: Date = new Date()): Promise<AutoOpenResult> {
  const config = await loadInvitationConfig(db)
  if (config.autoOpenBatch <= 0 || config.openUntil <= 0) return { opened: 0, reason: 'off', health: null }
  const status = await autoOpenStatus(db, now)
  if (status.freePlaces > 0) return { opened: 0, reason: 'room', health: status.health }
  if (status.waiting === 0) return { opened: 0, reason: 'nobody', health: status.health }
  const health = status.health!
  if (!health.ok) return { opened: 0, reason: health.reason, health }
  await db.invitationSettings.update({ where: { id: 1 }, data: { openUntil: { increment: config.autoOpenBatch } } })
  return { opened: config.autoOpenBatch, reason: 'ok', health }
}
