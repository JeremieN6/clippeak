import { prisma } from '../../../utils/prisma'
import { billingConfig, stripeClient } from '../../../utils/billingConfig'
import { requireBillingChannel } from '../../../utils/studioBilling'
import { clampPacks, isPayingStatus, normalizeInterval } from '../../../utils/clipping/billing'

// Ouvre la page de paiement Stripe pour l'offre payante. Le paiement a lieu chez Stripe : Clippeak ne voit jamais la carte.
export default defineEventHandler(async (event) => {
  const channelId = await requireBillingChannel(event)
  const config = billingConfig(event)
  const stripe = stripeClient()
  if (!config.configured || !stripe) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const billing = await prisma.channelBilling.findUnique({ where: { channelId } })
  if (isPayingStatus(billing?.status)) throw createError({ statusCode: 409, statusMessage: 'Tu as déjà l’offre payante. Gère-la depuis « Gérer mon abonnement ».' })
  // Rythme (annuel par defaut quand le prix annuel existe) et nombre de packs : valeurs inconnues ou hors limites ramenees a 1 ... 5.
  const body = await readBody(event).catch(() => null) as { interval?: unknown, packs?: unknown } | null
  const interval = normalizeInterval(body?.interval) ?? (config.yearlyPriceId ? 'year' : 'month')
  if (interval === 'year' && !config.yearlyPriceId) throw createError({ statusCode: 400, statusMessage: 'L’offre annuelle n’est pas encore disponible.' })
  const packs = clampPacks(body?.packs)
  try {
    // Client Stripe cree par nos soins (nom de la chaine + mention de TVA en pied de facture) ou mis a jour s'il existe deja.
    let customerId = billing?.stripeCustomerId ?? null
    if (!customerId) {
      const channel = await prisma.channel.findUniqueOrThrow({ where: { id: channelId }, select: { displayName: true } })
      customerId = (await stripe.createCustomer({ channelId, name: channel.displayName, footer: config.invoiceFooter })).id
      await prisma.channelBilling.upsert({ where: { channelId }, create: { channelId, stripeCustomerId: customerId }, update: { stripeCustomerId: customerId } })
    } else if (config.invoiceFooter) {
      await stripe.setCustomerInvoiceFooter(customerId, config.invoiceFooter).catch(() => {})
    }
    const session = await stripe.createCheckoutSession({
      priceId: interval === 'year' ? config.yearlyPriceId : config.priceId, channelId, customerId, packs, interval,
      successUrl: `${config.origin}/studio?billing=ok`, cancelUrl: `${config.origin}/studio?billing=cancel`
    })
    return { url: session.url }
  } catch (error) {
    console.error('[stripe] paiement impossible', error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'Le paiement n’est pas disponible pour le moment. Réessaie dans quelques minutes.' })
  }
})
