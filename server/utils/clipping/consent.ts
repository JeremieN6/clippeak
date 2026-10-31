// Consentement a la mesure d'audience (PostHog) : regles pures, testees. Rien n'est charge ni stocke par PostHog avant « granted ».
// Le choix (accepte OU refuse) est garde 6 mois dans le navigateur, puis redemande (recommandation de la CNIL).

export const CONSENT_KEY = 'clippeak.consent'
export const CONSENT_MAX_AGE_MS = 180 * 24 * 3600 * 1000

export type ConsentState = 'pending' | 'granted' | 'denied'

// Etat deduit de ce qui est stocke : tout ce qui est illisible, inconnu, date du futur ou trop ancien = « pas encore decide ».
export function parseConsent(raw: string | null | undefined, nowMs: number): ConsentState {
  if (!raw) return 'pending'
  try {
    const data = JSON.parse(raw) as { v?: unknown, at?: unknown }
    if (data.v !== 'granted' && data.v !== 'denied') return 'pending'
    if (typeof data.at !== 'number' || !Number.isFinite(data.at)) return 'pending'
    if (data.at > nowMs + 60_000) return 'pending'
    if (nowMs - data.at > CONSENT_MAX_AGE_MS) return 'pending'
    return data.v
  } catch {
    return 'pending'
  }
}

export const serializeConsent = (value: 'granted' | 'denied', nowMs: number): string => JSON.stringify({ v: value, at: nowMs })
