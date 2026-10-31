// https://nuxt.com/docs/api/configuration/nuxt-config
declare const process: { env: Record<string, string | undefined> }

export default defineNuxtConfig({
  modules: ['@nuxtjs/tailwindcss', 'nuxt-posthog'],
  css: ['~/assets/css/main.css', '~/assets/css/studio.css'],
  runtimeConfig: {
    adminPassword: process.env.ADMIN_PASSWORD || ''
  },
  // Le module `nuxt-posthog` est DESACTIVE : il demarrait PostHog et posait un cookie sans consentement (et appelait PostHog depuis le serveur
  // a chaque page). La cle et l'adresse restent lues ici ; `app/plugins/analytics.client.ts` demarre PostHog seulement apres accord du visiteur.
  posthog: {
    publicKey: process.env.NUXT_PUBLIC_POSTHOG_KEY,
    host: process.env.NUXT_PUBLIC_POSTHOG_HOST,
    disabled: true
  },
  // Verification de la propriete du site par Google Search Console (balise meta, dans le <head> de toutes les pages dont l'accueil).
  // A ne jamais supprimer : Google la reverifie regulierement.
  app: {
    head: {
      meta: [{ name: 'google-site-verification', content: 'dS4lDtb3GkUFSthFb5DQkzfwTUYCP_dKFWE5m1s7V8E' }]
    }
  },
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true }
})