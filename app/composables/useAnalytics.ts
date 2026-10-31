// Client PostHog, present SEULEMENT si le visiteur a accepte la mesure d'audience (voir le plugin analytics.client.ts).
// Tout le reste du code passe par `getAnalytics()` et ne fait rien quand il renvoie null.
export interface AnalyticsClient {
  capture: (name: string, props?: Record<string, unknown>) => void
}

const client = shallowRef<AnalyticsClient | null>(null)

export const getAnalytics = (): AnalyticsClient | null => client.value
export const setAnalytics = (value: AnalyticsClient | null): void => { client.value = value }
