import type { PrismaClient } from '@prisma/client'
import { clipRoom, effectiveQuota, isQuotaExempt, monthStart, nextMonthStart, quotaView, type QuotaView } from './quota'
import { bonusClips, DEFAULT_REFERRAL_BONUS_CAP } from './waves'
import { packsClips, planFor } from './billing'

// Acces base du plafond mensuel (regles pures : ./quota.ts). Partage par le worker et par les routes du site.
type Db = Pick<PrismaClient, 'clipJob' | 'channel' | 'referralGrant' | 'invitationSettings'>

// Clips produits ce mois-ci par la chaine : tous sauf les echecs de rendu (le streamer ne les a jamais vus) et les extraits longs
// (choisis a la main par le streamer, ils ne passent pas par le pipeline d'analyse).
export async function monthlyClipUsage(db: Db, channelId: string, now: Date = new Date()): Promise<number> {
  return db.clipJob.count({ where: { createdAt: { gte: monthStart(now) }, status: { not: 'failed' }, format: 'short', moment: { vod: { channelId } } } })
}

// Clips bonus de parrainage du mois (valables ce mois-ci seulement), au plus le plafond mensuel regle par l'admin.
export async function monthlyReferralBonus(db: Db, channelId: string, now: Date = new Date()): Promise<number> {
  const [sum, settings] = await Promise.all([
    db.referralGrant.aggregate({ _sum: { clips: true }, where: { channelId, createdAt: { gte: monthStart(now), lt: nextMonthStart(now) } } }),
    db.invitationSettings.findUnique({ where: { id: 1 }, select: { referralBonusCap: true } })
  ])
  return bonusClips(sum._sum.clips ?? 0, settings?.referralBonusCap ?? DEFAULT_REFERRAL_BONUS_CAP)
}

async function quotaOf(db: Db, channelId: string, now: Date): Promise<{ quota: number | null, bonus: number } | null> {
  const channel = await db.channel.findUnique({ where: { id: channelId }, select: { twitchId: true, settings: { select: { monthlyClipQuota: true } }, billing: { select: { status: true, packs: true } } } })
  if (!channel) return null
  const bonus = isQuotaExempt(channel.twitchId) ? 0 : await monthlyReferralBonus(db, channelId, now)
  return { bonus, quota: effectiveQuota({ twitchId: channel.twitchId, setting: channel.settings ? channel.settings.monthlyClipQuota : undefined, planClips: channel.billing && planFor(channel.billing.status) === 'creator' ? packsClips(channel.billing.packs) : 0, bonusClips: bonus }) }
}

// Clips encore possibles ce mois-ci (Infinity si illimite).
export async function channelClipRoom(db: Db, channelId: string, now: Date = new Date()): Promise<number> {
  const q = await quotaOf(db, channelId, now)
  const quota = q ? q.quota : null
  return clipRoom(quota, quota === null ? 0 : await monthlyClipUsage(db, channelId, now))
}

export async function channelQuotaView(db: Db, channelId: string, now: Date = new Date()): Promise<QuotaView> {
  const q = await quotaOf(db, channelId, now)
  return quotaView(q ? q.quota : null, await monthlyClipUsage(db, channelId, now), now, q ? q.bonus : 0)
}
