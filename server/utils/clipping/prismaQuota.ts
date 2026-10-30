import type { PrismaClient } from '@prisma/client'
import { clipRoom, effectiveQuota, monthStart, quotaView, type QuotaView } from './quota'

// Acces base du plafond mensuel (regles pures : ./quota.ts). Partage par le worker et par les routes du site.
type Db = Pick<PrismaClient, 'clipJob' | 'channel'>

// Clips produits ce mois-ci par la chaine : tous sauf les echecs de rendu (le streamer ne les a jamais vus).
export async function monthlyClipUsage(db: Db, channelId: string, now: Date = new Date()): Promise<number> {
  return db.clipJob.count({ where: { createdAt: { gte: monthStart(now) }, status: { not: 'failed' }, moment: { vod: { channelId } } } })
}

async function quotaOf(db: Db, channelId: string): Promise<number | null> {
  const channel = await db.channel.findUnique({ where: { id: channelId }, select: { twitchId: true, settings: { select: { monthlyClipQuota: true } } } })
  if (!channel) return null
  return effectiveQuota({ twitchId: channel.twitchId, setting: channel.settings ? channel.settings.monthlyClipQuota : undefined })
}

// Clips encore possibles ce mois-ci (Infinity si illimite).
export async function channelClipRoom(db: Db, channelId: string, now: Date = new Date()): Promise<number> {
  const quota = await quotaOf(db, channelId)
  return clipRoom(quota, quota === null ? 0 : await monthlyClipUsage(db, channelId, now))
}

export async function channelQuotaView(db: Db, channelId: string, now: Date = new Date()): Promise<QuotaView> {
  const quota = await quotaOf(db, channelId)
  return quotaView(quota, await monthlyClipUsage(db, channelId, now), now)
}
