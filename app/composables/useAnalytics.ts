import { buildPublicEvent } from '~~/server/utils/clipping/analytics'

// Client PostHog, present SEULEMENT si le visiteur a accepte la mesure d'audience (voir le plugin analytics.client.ts).
// Tout le reste du code passe par `getAnalytics()` et ne fait rien quand il renvoie null.
export interface AnalyticsClient {
  capture: (name: string, props?: Record<string, unknown>) => void
}

const client = shallowRef<AnalyticsClient | null>(null)

export const getAnalytics = (): AnalyticsClient | null => client.value
export const setAnalytics = (value: AnalyticsClient | null): void => { client.value = value }

// Evenement du site public : part seulement si le visiteur a accepte la mesure d'audience (sinon `client` est null) et si le nom est dans la
// liste fermee PUBLIC_EVENTS. Jamais de texte libre : voir `safeProps`.
// Renvoie true si l'evenement est parti (faux : pas d'accord, ou evenement hors liste).
export function trackEvent(name: string, props?: Record<string, unknown>): boolean {
  const evt = buildPublicEvent(name, props)
  if (!evt || !client.value) return false
  client.value.capture(evt.name, evt.props)
  return true
}
