import { prisma } from '../../../utils/prisma'
import { billingConfig, stripeClient } from '../../../utils/billingConfig'
import { requireBillingChannel } from '../../../utils/studioBilling'

// Portail Stripe : changer de carte, voir les factures, annuler l'abonnement.
export default defineEventHandler(async (event) => {
  const channelId = await requireBillingChannel(event)
  const config = billingConfig(event)
  const stripe = stripeClient()
  if (!config.configured || !stripe) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const billing = await prisma.channelBilling.findUnique({ where: { channelId }, select: { stripeCustomerId: true } })
  if (!billing?.stripeCustomerId) throw createError({ statusCode: 409, statusMessage: 'Aucun abonnement à gérer.' })
  try {
    return { url: (await stripe.createPortalSession({ customerId: billing.stripeCustomerId, returnUrl: `${config.origin}/studio` })).url }
  } catch (error) {
    console.error('[stripe] portail impossible', error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'Le portail n’est pas disponible pour le moment. Réessaie dans quelques minutes.' })
  }
})
