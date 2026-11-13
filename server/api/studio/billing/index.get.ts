import { prisma } from '../../../utils/prisma'
import { billingConfig, stripeClient } from '../../../utils/billingConfig'
import { requireStudioActor } from '../../../utils/studioAuth'
import { clampPacks, MAX_PACKS, normalizeInterval, packsClips, PLAN_CLIPS, PLAN_NAMES, planFor } from '../../../utils/clipping/billing'
import { isQuotaExempt } from '../../../utils/clipping/quota'

// Offre du streamer : disponible seulement si Stripe est configure (sinon la carte « Offre » n'apparait pas), plan actuel, prix mensuel et
// annuel (l'annuel seulement si son prix Stripe est pose), packs.
type Price = { amount: number, currency: string, interval: string | null }
const priceCache = new Map<string, { at: number, value: Price }>()

async function priceOf(priceId: string): Promise<Price> {
  const hit = priceCache.get(priceId)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value
  const value = await stripeClient()!.getPrice(priceId)
  priceCache.set(priceId, { at: Date.now(), value })
  return value
}

export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const config = billingConfig(event)
  if (!config.configured || actor.admin || !actor.channelId) return { available: false }
  const channel = await prisma.channel.findUnique({ where: { id: actor.channelId }, select: { twitchId: true, billing: true } })
  if (!channel || isQuotaExempt(channel.twitchId)) return { available: false }
  let month: Price
  let year: Price | null = null
  try {
    month = await priceOf(config.priceId)
    // Un prix annuel illisible n'empeche pas l'offre mensuelle : on ne propose simplement pas l'annuel.
    if (config.yearlyPriceId) year = await priceOf(config.yearlyPriceId).catch(() => null)
  } catch { return { available: false } }
  const plan = planFor(channel.billing?.status)
  const packs = plan === 'creator' ? clampPacks(channel.billing?.packs) : 1
  return {
    available: true,
    testMode: config.testMode,
    plan,
    planName: PLAN_NAMES[plan],
    status: channel.billing?.status ?? null,
    renewsAt: channel.billing?.currentPeriodEnd ?? null,
    // « Gerer mon abonnement » seulement apres un vrai abonnement : un client Stripe cree au clic sur « Passer a Creator » ne compte pas.
    canManage: Boolean(channel.billing?.stripeSubscriptionId),
    freeClips: PLAN_CLIPS.free,
    // Clips par pack ; `paidTotalClips` = ceux de l'abonnement actuel (packs x clips par pack).
    paidClips: PLAN_CLIPS.creator,
    paidTotalClips: packsClips(packs),
    packs,
    maxPacks: MAX_PACKS,
    interval: plan === 'creator' ? normalizeInterval(channel.billing?.billingInterval) : null,
    paidName: PLAN_NAMES.creator,
    price: { amount: month.amount, currency: month.currency, interval: month.interval },
    prices: { month: { amount: month.amount, currency: month.currency }, year: year ? { amount: year.amount, currency: year.currency } : null }
  }
})
