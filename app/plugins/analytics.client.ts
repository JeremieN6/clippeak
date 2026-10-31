import { defineNuxtPlugin, useRouter, useRuntimeConfig } from 'nuxt/app'
import { isPrivatePath, scrubEvent } from '~~/server/utils/clipping/analytics'

// Mesure d'audience (PostHog) APRES ACCORD seulement. Avant le choix du visiteur, ou s'il refuse : posthog-js n'est meme pas telecharge,
// aucune requete part vers PostHog, rien n'est ecrit dans le navigateur. Le module `nuxt-posthog` est desactive (nuxt.config) : il demarrait
// PostHog et posait un cookie des le chargement de la page, sans consentement.
// Dans le studio, l'administration, la connexion et l'attente : pas de suivi automatique des clics, adresses sans parametres, /admin muet
// (voir `analytics.ts`). Seuls les evenements nommes de `useStudio().track` y partent.
type PostHogInstance = {
  init: (key: string, options: Record<string, unknown>) => unknown
  register: (props: Record<string, unknown>) => void
  capture: (name: string, props?: Record<string, unknown>) => void
  set_config: (config: Record<string, unknown>) => void
  opt_in_capturing: () => void
  opt_out_capturing: () => void
  reset: () => void
}

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig().public.posthog as { publicKey?: string, host?: string } | undefined
  const router = useRouter()
  const consent = useConsent()
  consent.load()

  let ph: PostHogInstance | null = null
  let stopRouter: (() => void) | null = null
  let running = false

  const pageview = (fullPath: string) => ph?.capture('$pageview', { current_url: fullPath })

  async function start() {
    if (running || !config?.publicKey || !config.host) return
    running = true
    if (!ph) {
      const { default: posthog } = await import('posthog-js')
      if (consent.state.value !== 'granted') { running = false; return } // refuse pendant le chargement
      ph = posthog as unknown as PostHogInstance
      ph.init(config.publicKey, {
        api_host: config.host,
        capture_pageview: false,
        capture_pageleave: true,
        persistence: 'localStorage', // ni cookie ni identifiant partage entre sites
        opt_out_capturing_persistence_type: 'localStorage',
        disable_session_recording: true,
        autocapture: !isPrivatePath(router.currentRoute.value.path),
        before_send: (event: Parameters<typeof scrubEvent>[0]) => scrubEvent(event)
      })
      ph.register({ app_name: 'clippeak' })
    } else {
      ph.opt_in_capturing()
    }
    setAnalytics(ph as unknown as AnalyticsClient)
    pageview(router.currentRoute.value.fullPath)
    stopRouter = router.afterEach((to) => {
      ph?.set_config({ autocapture: !isPrivatePath(to.path) })
      pageview(to.fullPath)
    })
  }

  // Refus (ou « Gerer mes cookies ») : PostHog s'arrete et ses donnees locales sont effacees. Seule la trace du refus est gardee.
  function stop() {
    if (!running) return
    running = false
    stopRouter?.()
    stopRouter = null
    setAnalytics(null)
    const wipe = () => {
      try { for (const key of Object.keys(localStorage)) if (key.startsWith('ph_')) localStorage.removeItem(key) } catch { /* stockage indisponible : rien a effacer */ }
    }
    try { ph?.opt_out_capturing() } catch { /* deja arrete */ }
    wipe()
    // PostHog peut reecrire son stockage juste apres l'arret : on efface une seconde fois si le visiteur n'a pas re-accepte entre temps.
    setTimeout(() => { if (!running) wipe() }, 1000)
  }

  watch(consent.state, (value) => { if (value === 'granted') void start(); else stop() }, { immediate: true })
})
