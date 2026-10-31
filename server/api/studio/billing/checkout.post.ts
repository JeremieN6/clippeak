import { prisma } from '../../../utils/prisma'
import { billingConfig, stripeClient } from '../../../utils/billingConfig'
import { requireBillingChannel } from '../../../utils/studioBilling'
import { isPayingStatus } from '../../../utils/clipping/billing'

// Ouvre la page de paiement Stripe pour l'offre payante. Le paiement a lieu chez Stripe : Clippeak ne voit jamais la carte.
export default defineEventHandler(async (event) => {
  const channelId = await requireBillingChannel(event)
  const config = billingConfig(event)
  const stripe = stripeClient()
  if (!config.configured || !stripe) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const billing = await prisma.channelBilling.findUnique({ where: { channelId } })
  if (isPayingStatus(billing?.status)) throw createError({ statusCode: 409, statusMessage: 'Tu as déjà l’offre payante. Gère-la depuis « Gérer mon abonnement ».' })
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
      priceId: config.priceId, channelId, customerId,
      successUrl: `${config.origin}/studio?billing=ok`, cancelUrl: `${config.origin}/studio?billing=cancel`
    })
    return { url: session.url }
  } catch (error) {
    console.error('[stripe] paiement impossible', error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'Le paiement n’est pas disponible pour le moment. Réessaie dans quelques minutes.' })
  }
})
