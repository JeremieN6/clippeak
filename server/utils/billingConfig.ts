import type { H3Event } from 'h3'
import { readEnv } from './env'
import { createStripeClient, type StripeClient } from './clipping/stripeApi'

// Reglages Stripe, lus a chaque appel (`readEnv` : .env.local du serveur). Sans cle secrete ET sans prix, la facturation est INVISIBLE :
// aucune carte « Offre » dans le studio, aucune route de paiement. Les cles de test (sk_test_) et de production (sk_live_) se remplacent
// l'une par l'autre sans changer le code.
export function billingConfig(event?: H3Event) {
  // `STRIPE_SECRET_API_KEY` est accepte aussi (nom choisi par le porteur dans son .env.local local).
  const secretKey = readEnv('STRIPE_SECRET_KEY') || readEnv('STRIPE_SECRET_API_KEY')
  const priceId = readEnv('STRIPE_PRICE_CREATOR')
  const webhookSecret = readEnv('STRIPE_WEBHOOK_SECRET')
  const publicUrl = readEnv('CLIPPEAK_PUBLIC_URL').replace(/\/+$/, '')
  const origin = publicUrl || (event ? `${getRequestProtocol(event, { xForwardedProto: true })}://${getRequestHost(event, { xForwardedHost: true })}` : '')
  return { secretKey, priceId, webhookSecret, origin, configured: Boolean(secretKey && priceId), webhookConfigured: Boolean(webhookSecret), testMode: secretKey.startsWith('sk_test_') || secretKey.startsWith('rk_test_') }
}

export function stripeClient(): StripeClient | null {
  const { secretKey } = billingConfig()
  if (!secretKey) return null
  return createStripeClient({ secretKey, apiBase: readEnv('STRIPE_API_BASE_URL') || undefined })
}
