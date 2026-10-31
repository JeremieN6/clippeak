import { billingConfig } from '../../utils/billingConfig'
import { verifyStripeSignature } from '../../utils/clipping/billing'
import { applyStripeEvent, type StripeEventLike } from '../../utils/billingStore'

// Evenements Stripe (paiement termine, abonnement cree / modifie / supprime). La signature est verifiee sur le corps BRUT avant toute
// lecture ; sans secret configure, la route est fermee. Les erreurs de traitement renvoient 500 : Stripe reessaie.
export default defineEventHandler(async (event) => {
  const config = billingConfig(event)
  if (!config.webhookConfigured) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const raw = (await readRawBody(event, 'utf8')) ?? ''
  if (!verifyStripeSignature(raw, getHeader(event, 'stripe-signature'), config.webhookSecret)) throw createError({ statusCode: 400, statusMessage: 'Signature invalide' })
  let payload: StripeEventLike
  try { payload = JSON.parse(raw) } catch { throw createError({ statusCode: 400, statusMessage: 'Corps illisible' }) }
  if (!payload?.id || !payload?.type) throw createError({ statusCode: 400, statusMessage: 'Evenement invalide' })
  try {
    const result = await applyStripeEvent(payload)
    if (result === 'unknown_channel') console.warn('[stripe] evenement sans chaine connue', payload.type, payload.id)
    return { received: true, result }
  } catch (error) {
    console.error('[stripe] traitement en echec', payload.type, payload.id, error instanceof Error ? error.message : error)
    throw createError({ statusCode: 500, statusMessage: 'Traitement impossible' })
  }
})
