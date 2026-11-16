import type { PrismaClient } from '@prisma/client'
import { clipRoom, effectiveQuota, isQuotaExempt, liveLimit, liveQuotaView, liveRoom, monthStart, nextMonthStart, quotaMode, quotaView, type QuotaMode, type QuotaView } from './quota'
import { bonusClips, DEFAULT_REFERRAL_BONUS_CAP } from './waves'
import { packsClips, planFor } from './billing'

// Acces base du plafond mensuel (regles pures : ./quota.ts). Partage par le worker et par les routes du site.
type Db = Pick<PrismaClient, 'clipJob' | 'channel' | 'referralGrant' | 'invitationSettings' | 'vod'>

// Clips produits ce mois-ci par la chaine : tous sauf les echecs de rendu (le streamer ne les a jamais vus) et les extraits longs
// (choisis a la main par le streamer, ils ne passent pas par le pipeline d'analyse).
export async function monthlyClipUsage(db: Db, channelId: string, now: Date = new Date()): Promise<number> {
  return db.clipJob.count({ where: { createdAt: { gte: monthStart(now) }, status: { not: 'failed' }, format: 'short', moment: { vod: { channelId } } } })
}

// Lives admis ce mois-ci pour la chaine (gratuit compte en lives : voir ./quota.ts).
export async function monthlyLiveUsage(db: Db, channelId: string, now: Date = new Date()): Promise<number> {
  return db.vod.count({ where: { channelId, admittedAt: { gte: monthStart(now) } } })
}

// Clips bonus de parrainage du mois (valables ce mois-ci seulement), au plus le plafond mensuel regle par l'admin.
export async function monthlyReferralBonus(db: Db, channelId: string, now: Date = new Date()): Promise<number> {
  const [sum, settings] = await Promise.all([
    db.referralGrant.aggregate({ _sum: { clips: true }, where: { channelId, createdAt: { gte: monthStart(now), lt: nextMonthStart(now) } } }),
    db.invitationSettings.findUnique({ where: { id: 1 }, select: { referralBonusCap: true } })
  ])
  return bonusClips(sum._sum.clips ?? 0, settings?.referralBonusCap ?? DEFAULT_REFERRAL_BONUS_CAP)
}

interface ChannelQuota { mode: QuotaMode, quota: number | null, bonus: number }

async function quotaOf(db: Db, channelId: string, now: Date): Promise<ChannelQuota | null> {
  const channel = await db.channel.findUnique({ where: { id: channelId }, select: { twitchId: true, settings: { select: { monthlyClipQuota: true } }, billing: { select: { status: true, packs: true } } } })
  if (!channel) return null
  const bonus = isQuotaExempt(channel.twitchId) ? 0 : await monthlyReferralBonus(db, channelId, now)
  const setting = channel.settings ? channel.settings.monthlyClipQuota : undefined
  const planClips = channel.billing && planFor(channel.billing.status) === 'creator' ? packsClips(channel.billing.packs) : 0
  const mode = quotaMode({ twitchId: channel.twitchId, setting, planClips })
  // En mode « lives », le bonus de parrainage donne des lives en plus (il n'ajoute pas de clips).
  return { mode, bonus, quota: effectiveQuota({ twitchId: channel.twitchId, setting, planClips, bonusClips: mode === 'lives' ? 0 : bonus }) }
}

// Place restante pour produire des clips (Infinity si illimite). Gratuit en lives : une VOD deja admise a toujours de la place (elle est decoupee
// en entier) ; une nouvelle VOD n'est admise que s'il reste un live ce mois-ci. Sans `vodId`, on repond pour « une nouvelle VOD ».
// ATTENTION : avec `vodId`, une VOD non admise est ADMISE ici si de la place reste (un live ne peut etre pris en charge qu'une fois admis).
export async function channelClipRoom(db: Db, channelId: string, now: Date = new Date(), vodId?: string): Promise<number> {
  const q = await quotaOf(db, channelId, now)
  if (!q || q.mode === 'unlimited') return Number.POSITIVE_INFINITY
  if (q.mode === 'clips') return clipRoom(q.quota, await monthlyClipUsage(db, channelId, now))
  if (vodId) {
    const vod = await db.vod.findUnique({ where: { id: vodId }, select: { admittedAt: true } })
    if (vod?.admittedAt) return Number.POSITIVE_INFINITY
  }
  if (liveRoom(liveLimit(q.bonus), await monthlyLiveUsage(db, channelId, now)) <= 0) return 0
  if (vodId) await db.vod.updateMany({ where: { id: vodId, admittedAt: null }, data: { admittedAt: now } })
  return Number.POSITIVE_INFINITY
}

export async function channelQuotaView(db: Db, channelId: string, now: Date = new Date()): Promise<QuotaView> {
  const q = await quotaOf(db, channelId, now)
  if (q && q.mode === 'lives') return liveQuotaView(liveLimit(q.bonus), await monthlyLiveUsage(db, channelId, now), await monthlyClipUsage(db, channelId, now), now, q.bonus)
  return quotaView(q ? q.quota : null, await monthlyClipUsage(db, channelId, now), now, q ? q.bonus : 0)
}
