// Entonnoir d'acquisition (onglet « Entonnoir » de /admin) : calcul pur et testable, depuis les donnees de la base.
// Chiffres EXACTS (pas d'echantillon) et sans consentement : donnees operationnelles, agregees, aucune information personnelle en sortie.
// Les chaines de demonstration et de test (admin) sont exclues par l'appelant.

import { effectiveQuota, monthStart } from './quota.ts'

export const FUNNEL_STEPS = [
  { id: 'requests', label: 'Demandes d’accès', hint: 'Streamers qui ont cliqué « Prévenez-moi » sur la page d’attente (une demande disparaît quand tu invites la personne).' },
  { id: 'invites', label: 'Invitations', hint: 'Streamers invités par toi.' },
  { id: 'connected', label: 'Première connexion', hint: 'Chaînes créées à la première connexion Twitch.' },
  { id: 'onboarding', label: 'Démarrage terminé', hint: 'Le parcours guidé du studio est terminé (date approchée : dernière modification du style).' },
  { id: 'batch', label: 'Premier lot de clips prêt', hint: 'Au moins un clip vertical est arrivé à la validation.' },
  { id: 'validated', label: 'Premier clip validé', hint: 'Au moins un clip approuvé par le streamer.' },
  { id: 'quota', label: 'Limite de clips atteinte', hint: 'Une chaîne a utilisé tout son quota du mois (calculé avec son plafond actuel).' },
  { id: 'paid', label: 'Paiement', hint: 'Abonnement Creator actif.' }
] as const
export type FunnelStepId = (typeof FUNNEL_STEPS)[number]['id']

// Chaque etape est comparee a l'etape qui la precede dans CETTE table (pas toujours la precedente de la liste) :
// la limite atteinte et le paiement partent tous deux du premier clip valide.
const PARENT: Record<FunnelStepId, FunnelStepId | null> = {
  requests: null,
  invites: 'requests',
  connected: 'invites',
  onboarding: 'connected',
  batch: 'onboarding',
  validated: 'batch',
  quota: 'validated',
  paid: 'validated'
}

export interface FunnelChannel {
  twitchId: string
  connectedAt: Date
  onboardingAt?: Date | null
  batchAt?: Date | null
  validatedAt?: Date | null
  quotaAt?: Date | null
  paidAt?: Date | null
}
export interface FunnelInput {
  requests: Date[]
  invites: Array<{ createdAt: Date, twitchId: string | null }>
  channels: FunnelChannel[]
}
export interface FunnelStep {
  id: FunnelStepId
  label: string
  hint: string
  count: number
  // Part de l'etape de reference (en %, arrondi) ; null pour la premiere etape.
  rateFromParent: number | null
  parent: FunnelStepId | null
  // Delai median (en jours, 1 decimale) entre l'etape de reference et celle-ci, pour les chaines qui ont les deux ; null si non mesurable.
  medianDays: number | null
}
export interface FunnelWeek { weekStart: string, counts: Record<FunnelStepId, number> }
export interface FunnelResult { steps: FunnelStep[], weeks: FunnelWeek[], generatedAt: string }

const DAY = 86_400_000
const dateOf = (v: Date | null | undefined): number | null => (v instanceof Date && !Number.isNaN(v.getTime()) ? v.getTime() : null)

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

// Lundi (UTC) de la semaine de la date, a minuit.
export function weekStart(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day))
}

// Date a laquelle la chaine a atteint son plafond mensuel : le clip qui a rempli le quota, dans le premier mois ou cela est arrive.
// `createdAts` : dates de creation des clips produits (hors echecs, verticaux). Quota null = illimite : jamais atteint.
export function quotaReachedAt(createdAts: Date[], quota: number | null): Date | null {
  if (quota === null || quota <= 0) return null
  const byMonth = new Map<number, number[]>()
  for (const d of createdAts) {
    const key = monthStart(d).getTime()
    const list = byMonth.get(key)
    if (list) list.push(d.getTime()); else byMonth.set(key, [d.getTime()])
  }
  let best: number | null = null
  for (const list of byMonth.values()) {
    if (list.length < quota) continue
    list.sort((a, b) => a - b)
    const hit = list[quota - 1]!
    if (best === null || hit < best) best = hit
  }
  return best === null ? null : new Date(best)
}
export { effectiveQuota }

// Date de chaque etape pour chaque « personne ». Etapes 1 et 2 : une date par demande / invitation. Etapes 3 a 8 : une date par chaine,
// seulement si toutes les etapes precedentes de sa branche sont atteintes (sinon le taux pourrait depasser 100 %).
export function computeFunnel(input: FunnelInput, now: Date = new Date(), weeksShown = 12): FunnelResult {
  const dates: Record<FunnelStepId, number[]> = { requests: [], invites: [], connected: [], onboarding: [], batch: [], validated: [], quota: [], paid: [] }
  for (const d of input.requests) { const t = dateOf(d); if (t !== null) dates.requests.push(t) }
  for (const i of input.invites) { const t = dateOf(i.createdAt); if (t !== null) dates.invites.push(t) }

  // Delais par chaine : [etape de reference -> etape] en jours.
  const delays: Partial<Record<FunnelStepId, number[]>> = {}
  const addDelay = (id: FunnelStepId, from: number, to: number) => { if (to >= from) (delays[id] ??= []).push((to - from) / DAY) }

  const usedInvites = input.invites.filter(i => i.twitchId !== null).length
  const inviteAt = new Map<string, number>()
  for (const i of input.invites) { const t = dateOf(i.createdAt); if (i.twitchId && t !== null) inviteAt.set(i.twitchId, t) }

  for (const c of input.channels) {
    const connected = dateOf(c.connectedAt)
    if (connected === null) continue
    dates.connected.push(connected)
    const invited = inviteAt.get(c.twitchId)
    if (invited !== undefined) addDelay('connected', invited, connected)
    const onboarding = dateOf(c.onboardingAt)
    if (onboarding === null) continue
    dates.onboarding.push(onboarding); addDelay('onboarding', connected, onboarding)
    const batch = dateOf(c.batchAt)
    if (batch === null) continue
    dates.batch.push(batch); addDelay('batch', onboarding, batch)
    const validated = dateOf(c.validatedAt)
    if (validated === null) continue
    dates.validated.push(validated); addDelay('validated', batch, validated)
    const quota = dateOf(c.quotaAt)
    if (quota !== null) { dates.quota.push(quota); addDelay('quota', validated, quota) }
    const paid = dateOf(c.paidAt)
    if (paid !== null) { dates.paid.push(paid); addDelay('paid', validated, paid) }
  }

  const steps: FunnelStep[] = FUNNEL_STEPS.map((s) => {
    const parent = PARENT[s.id]
    const count = dates[s.id].length
    const parentCount = parent ? dates[parent].length : 0
    const med = median(delays[s.id] ?? [])
    // Deux etapes ne sont pas « emboitees » : une demande disparait quand l'admin invite (invitations > demandes possible) et une chaine peut
    // exister sans invitation. Pour elles : pas de taux demandes -> invitations ; connexions = invitations utilisees (identifiant Twitch rempli)
    // sur invitations envoyees. Pour toutes les autres, le taux est un vrai sous-ensemble (jamais au-dessus de 100 %).
    let rate: number | null = parent && parentCount > 0 ? Math.round((count / parentCount) * 100) : null
    if (s.id === 'invites') rate = null
    if (s.id === 'connected') rate = dates.invites.length > 0 ? Math.round((usedInvites / dates.invites.length) * 100) : null
    return {
      id: s.id, label: s.label, hint: s.hint, count, parent,
      rateFromParent: rate,
      medianDays: med === null ? null : Math.round(med * 10) / 10
    }
  })

  const lastWeek = weekStart(now).getTime()
  const weeks: FunnelWeek[] = []
  for (let k = weeksShown - 1; k >= 0; k--) {
    const start = lastWeek - k * 7 * DAY
    const counts = {} as Record<FunnelStepId, number>
    for (const s of FUNNEL_STEPS) counts[s.id] = dates[s.id].filter(t => t >= start && t < start + 7 * DAY).length
    weeks.push({ weekStart: new Date(start).toISOString().slice(0, 10), counts })
  }
  return { steps, weeks, generatedAt: now.toISOString() }
}
