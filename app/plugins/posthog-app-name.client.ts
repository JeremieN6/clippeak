import { defineNuxtPlugin, useNuxtApp } from 'nuxt/app'

type PostHogClientLike = {
  register: (properties: Record<string, string>) => void
}

export default defineNuxtPlugin(() => {
  const { $clientPosthog } = useNuxtApp()
  const posthog = $clientPosthog as PostHogClientLike | null | undefined
  posthog?.register({ app_name: 'clippeak' })
})