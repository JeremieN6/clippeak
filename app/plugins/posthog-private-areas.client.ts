import { defineNuxtPlugin, useNuxtApp, useRouter } from 'nuxt/app'
import { isPrivatePath, scrubEvent } from '~~/server/utils/clipping/analytics'

type PostHogLike = { set_config: (config: Record<string, unknown>) => void }

// Studio, administration, connexion et attente : PostHog n'enregistre AUCUN clic ni texte (le suivi automatique y est coupe).
// Tout evenement part nettoye (`before_send`) : /admin n'envoie rien, les autres espaces prives perdent les parametres d'adresse.
// Seuls les evenements nommes de `useStudio().track` y partent, avec des proprietes neutres. Sur les pages publiques : inchange.
export default defineNuxtPlugin(() => {
  const posthog = useNuxtApp().$clientPosthog as PostHogLike | null | undefined
  if (!posthog) return
  posthog.set_config({ before_send: (evt: Parameters<typeof scrubEvent>[0]) => scrubEvent(evt) })
  const apply = (path: string) => posthog.set_config({ autocapture: !isPrivatePath(path) })
  const router = useRouter()
  apply(router.currentRoute.value.path)
  router.afterEach(to => apply(to.path))
})
