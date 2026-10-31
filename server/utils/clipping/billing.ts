import { createHmac, timingSafeEqual } from 'node:crypto'

// Offres et facturation (Stripe) : regles pures, testables. Une seule offre payante pour commencer (decision du porteur, 2026-10-31).
// Les prix et les noms vivent dans Stripe ; ici seulement ce que Clippeak en deduit : quel plan, combien de clips.

// Mention imprimee en pied de chaque facture Stripe (le porteur est auto-entrepreneur, franchise en base de TVA). Modifiable sans code :
// variable `STRIPE_INVOICE_FOOTER` (texte libre ; « none » pour ne rien imprimer, par exemple si la TVA devient applicable).
export const DEFAULT_INVOICE_FOOTER = 'TVA non applicable, art. 293 B du CGI'
export function invoiceFooter(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim()
  if (!value) return DEFAULT_INVOICE_FOOTER
  if (value.toLowerCase() === 'none') return null
  return value.slice(0, 500)
}

export type Plan = 'free' | 'creator'

// Clips par mois selon l'offre. Gratuit : 40 (decision du porteur). Creator : 120, valeur de depart a ajuster (le porteur n'avait pas de chiffre).
export const PLAN_CLIPS: Record<Plan, number> = { free: 40, creator: 120 }
export const PLAN_NAMES: Record<Plan, string> = { free: 'Starter', creator: 'Creator' }

// Etats d'abonnement Stripe qui donnent droit a l'offre payante (« past_due » : quelques jours de grace pendant que Stripe relance le paiement).
const PAYING = new Set(['active', 'trialing', 'past_due'])
export const isPayingStatus = (status: string | null | undefined): boolean => Boolean(status && PAYING.has(status))
export const planFor = (status: string | null | undefined): Plan => isPayingStatus(status) ? 'creator' : 'free'

// Date de fin de periode d'un abonnement : selon la version de l'API Stripe, elle est sur l'abonnement ou sur son premier element.
export function periodEnd(subscription: { current_period_end?: unknown, items?: { data?: Array<{ current_period_end?: unknown }> } }): Date | null {
  const raw = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end
  return typeof raw === 'number' && Number.isFinite(raw) ? new Date(raw * 1000) : null
}

// Verification de la signature d'un webhook Stripe (en-tete `Stripe-Signature: t=...,v1=...`) : HMAC-SHA256 de « t.corps », comparaison en
// temps constant, evenement trop ancien refuse (anti-rejeu, 5 minutes). Le corps doit etre le texte BRUT recu, jamais le JSON relu.
export function verifyStripeSignature(rawBody: string, header: string | undefined, secret: string, nowMs: number = Date.now(), toleranceSec = 300): boolean {
  if (!header || !secret) return false
  const parts = header.split(',').map(p => p.trim().split('='))
  const t = parts.find(p => p[0] === 't')?.[1]
  const signatures = parts.filter(p => p[0] === 'v1').map(p => p[1] ?? '')
  const ts = Number(t)
  if (!t || !Number.isFinite(ts) || !signatures.length) return false
  if (Math.abs(nowMs / 1000 - ts) > toleranceSec) return false
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  return signatures.some((sig) => {
    const a = Buffer.from(sig, 'utf8'); const b = Buffer.from(expected, 'utf8')
    return a.length === b.length && timingSafeEqual(a, b)
  })
}

// Pour les essais : fabrique l'en-tete que Stripe enverrait.
export function signStripePayload(rawBody: string, secret: string, nowMs: number = Date.now()): string {
  const t = Math.floor(nowMs / 1000)
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')}`
}

export interface BillingState { plan: Plan, status: string | null, periodEnd: Date | null }

// Ce que le webhook doit enregistrer pour un evenement d'abonnement (null = evenement sans effet).
export function applySubscriptionEvent(type: string, sub: { status?: string, current_period_end?: unknown, items?: { data?: Array<{ current_period_end?: unknown }> } }): BillingState | null {
  if (type === 'customer.subscription.deleted') return { plan: 'free', status: 'canceled', periodEnd: periodEnd(sub) }
  if (type !== 'customer.subscription.created' && type !== 'customer.subscription.updated') return null
  const status = typeof sub.status === 'string' ? sub.status : null
  return { plan: planFor(status), status, periodEnd: periodEnd(sub) }
}
