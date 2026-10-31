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
    const session = await stripe.createCheckoutSession({
      priceId: config.priceId, channelId, customerId: billing?.stripeCustomerId ?? null,
      successUrl: `${config.origin}/studio?billing=ok`, cancelUrl: `${config.origin}/studio?billing=cancel`
    })
    return { url: session.url }
  } catch (error) {
    console.error('[stripe] paiement impossible', error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'Le paiement n’est pas disponible pour le moment. Réessaie dans quelques minutes.' })
  }
})
