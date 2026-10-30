<script setup lang="ts">
// Espace du streamer : parcours guide en 8 etapes puis tableau de bord de contenu. On y entre connecte avec Twitch (/connexion).
// L'admin y arrive depuis /admin (session admin) : il voit la chaine de demonstration par defaut, sans toucher a un vrai compte.
useHead({ title: 'Studio Clippeak', meta: [{ name: 'robots', content: 'noindex' }] })

const studio = createStudio()
provide(STUDIO_KEY, studio)

const { connected, error, notice, view } = studio

const route = useRoute()
const checking = ref(true)

// Un message de succes disparait seul apres 6 s ; une erreur reste jusqu'a ce qu'on la ferme.
let noticeTimer: ReturnType<typeof setTimeout> | null = null
watch(notice, (n) => {
  if (noticeTimer) clearTimeout(noticeTimer)
  if (n) noticeTimer = setTimeout(() => { notice.value = '' }, 6000)
})
onBeforeUnmount(() => { if (noticeTimer) clearTimeout(noticeTimer) })

// Retour d'une connexion de plateforme (voir /api/auth/youtube) : message, puis retour a l'etape des plateformes.
const connectMessages: Record<string, string> = {
  youtube: 'YouTube est connecté.',
  cancelled: 'Connexion annulée.',
  error: 'La connexion a échoué. Réessaie dans un instant.',
  unavailable: 'La publication YouTube n’est pas encore activée.',
  admin: 'Connecte une plateforme depuis un compte streamer.'
}

onMounted(async () => {
  const ok = await studio.restoreSession(typeof route.query.channel === 'string' ? route.query.channel : '')
  if (!ok) return navigateTo('/connexion', { replace: true })
  checking.value = false
  const result = String(route.query.connect ?? '')
  if (result) {
    if (result === 'youtube') studio.notice.value = connectMessages.youtube
    else studio.error.value = connectMessages[result] ?? ''
    studio.goToStep(7)
    await navigateTo({ query: {} }, { replace: true })
  }
})
</script>

<template>
  <div class="st-root min-h-screen bg-st-bg">
    <StudioAppBar />

    <!-- Message flottant : ne decale rien, se ferme tout seul (succes) ou a la demande (erreur). -->
    <div class="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-end sm:left-auto sm:right-6 sm:w-[420px]" aria-live="polite">
      <Transition name="st-step">
        <div v-if="error || notice" :key="error || notice" class="st-alert pointer-events-auto w-full items-center border shadow-[0_8px_24px_rgba(0,0,0,.4)]" :class="error ? 'st-alert-error border-st-errorBorder' : 'st-alert-ok border-st-okBorder'" :role="error ? 'alert' : 'status'">
          <svg class="flex-none" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-if="error" d="M12 7v6M12 17h.01" /><path v-else d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          <span class="min-w-0 flex-1">{{ error || notice }}</span>
          <button type="button" class="-my-2 -mr-2 flex h-11 w-11 flex-none items-center justify-center rounded-[10px] bg-transparent text-current hover:bg-white/10" aria-label="Fermer le message" @click="error = ''; notice = ''">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      </Transition>
    </div>

    <template v-if="connected && studio.detail.value">
      <StudioAccount v-if="view === 'account'" />
      <StudioRoadmap v-else-if="view === 'roadmap'" />
      <StudioDashboard v-else-if="view === 'dashboard'" />
      <StudioOnboarding v-else />
    </template>
    <StudioSkeleton v-else-if="checking" />
  </div>
</template>
