import { prisma } from '../../../utils/prisma'
import { billingConfig, stripeClient } from '../../../utils/billingConfig'
import { requireStudioActor } from '../../../utils/studioAuth'
import { PLAN_CLIPS, PLAN_NAMES, planFor } from '../../../utils/clipping/billing'
import { isQuotaExempt } from '../../../utils/clipping/quota'

// Offre du streamer : disponible seulement si Stripe est configure (sinon la carte « Offre » n'apparait pas), plan actuel, prix.
let priceCache: { at: number, key: string, value: { amount: number, currency: string, interval: string | null } } | null = null

export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const config = billingConfig(event)
  if (!config.configured || actor.admin || !actor.channelId) return { available: false }
  const channel = await prisma.channel.findUnique({ where: { id: actor.channelId }, select: { twitchId: true, billing: true } })
  if (!channel || isQuotaExempt(channel.twitchId)) return { available: false }
  let price = priceCache && priceCache.key === config.priceId && Date.now() - priceCache.at < 10 * 60_000 ? priceCache.value : null
  if (!price) {
    try {
      price = await stripeClient()!.getPrice(config.priceId)
      priceCache = { at: Date.now(), key: config.priceId, value: price }
    } catch { return { available: false } }
  }
  const plan = planFor(channel.billing?.status)
  return {
    available: true,
    testMode: config.testMode,
    plan,
    planName: PLAN_NAMES[plan],
    status: channel.billing?.status ?? null,
    renewsAt: channel.billing?.currentPeriodEnd ?? null,
    canManage: Boolean(channel.billing?.stripeCustomerId),
    freeClips: PLAN_CLIPS.free,
    paidClips: PLAN_CLIPS.creator,
    paidName: PLAN_NAMES.creator,
    price: { amount: price.amount, currency: price.currency, interval: price.interval }
  }
})
