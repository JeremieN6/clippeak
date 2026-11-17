import { prisma } from '../../../utils/prisma'
import { billingConfig, stripeClient } from '../../../utils/billingConfig'
import { requireBillingChannel } from '../../../utils/studioBilling'
import { isMissingResource } from '../../../utils/clipping/stripeApi'

// Portail Stripe : changer de carte, voir les factures, annuler l'abonnement.
export default defineEventHandler(async (event) => {
  const channelId = await requireBillingChannel(event)
  const config = billingConfig(event)
  const stripe = stripeClient()
  if (!config.configured || !stripe) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const billing = await prisma.channelBilling.findUnique({ where: { channelId }, select: { stripeCustomerId: true, stripeSubscriptionId: true } })
  if (!billing?.stripeCustomerId || !billing.stripeSubscriptionId) throw createError({ statusCode: 409, statusMessage: 'Aucun abonnement à gérer.' })
  try {
    return { url: (await stripe.createPortalSession({ customerId: billing.stripeCustomerId, returnUrl: `${config.origin}/studio` })).url }
  } catch (error) {
    console.error('[stripe] portail impossible', error instanceof Error ? error.message : error)
    // Le client n'existe pas chez Stripe en production (abonnement d'essai, cree avec les cles de test) : ce n'est pas une panne passagere.
    if (isMissingResource(error)) throw createError({ statusCode: 409, statusMessage: 'Cet abonnement n’existe plus chez Stripe : il date des essais. Écris à contact.clippeak@sassify.fr pour le remettre à zéro, puis souscris à nouveau.' })
    throw createError({ statusCode: 503, statusMessage: 'Le portail n’est pas disponible pour le moment. Réessaie dans quelques minutes.' })
  }
})
