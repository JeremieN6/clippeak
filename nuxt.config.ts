// https://nuxt.com/docs/api/configuration/nuxt-config
declare const process: { env: Record<string, string | undefined> }

export default defineNuxtConfig({
  modules: ['@nuxtjs/tailwindcss', 'nuxt-posthog'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    adminPassword: process.env.ADMIN_PASSWORD || ''
  },
  posthog: {
    publicKey: process.env.NUXT_PUBLIC_POSTHOG_KEY,
    host: process.env.NUXT_PUBLIC_POSTHOG_HOST,
  },
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true }
})