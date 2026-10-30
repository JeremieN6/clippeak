<script setup lang="ts">
// Espace du streamer : parcours guide en 8 etapes puis tableau de bord de contenu. On y entre connecte avec Twitch (/connexion).
// L'admin y arrive depuis /admin (session admin) : il voit la chaine de demonstration par defaut, sans toucher a un vrai compte.
useHead({ title: 'Studio Clippeak', meta: [{ name: 'robots', content: 'noindex' }] })

const studio = createStudio()
provide(STUDIO_KEY, studio)

const { connected, error, notice, busy, channels, channelId, view, mode } = studio

const route = useRoute()
const checking = ref(true)

// Un message de succes disparait seul apres 6 s ; une erreur reste jusqu'a ce qu'on la ferme.
let noticeTimer: ReturnType<typeof setTimeout> | null = null
watch(notice, (n) => {
  if (noticeTimer) clearTimeout(noticeTimer)
  if (n) noticeTimer = setTimeout(() => { notice.value = '' }, 6000)
})
onBeforeUnmount(() => { if (noticeTimer) clearTimeout(noticeTimer) })
const currentChannel = computed(() => channels.value.find(c => c.id === channelId.value))
const onDemo = computed(() => Boolean(currentChannel.value?.demo))
const onTest = computed(() => Boolean(currentChannel.value?.test))

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

async function switchChannel() {
  await navigateTo({ query: { channel: channelId.value } }, { replace: true })
  await studio.switchChannel()
}

async function logout() {
  await studio.logout()
  await navigateTo('/connexion')
}
</script>

<template>
  <div class="st-root min-h-screen bg-st-bg">
    <!-- Une seule barre : logo a gauche ; en admin, le compte affiche (pastille + choix de chaine) puis les actions. -->
    <header class="z-30 sm:sticky sm:top-0 flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 border-b border-st-border bg-st-bg px-5 py-2 sm:px-8">
      <NuxtLink to="/" class="flex min-h-11 items-center gap-2.5 text-st-text no-underline" aria-label="Clippeak, accueil">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-st-accent text-xs font-extrabold text-white" aria-hidden="true">CP</span>
        <span class="st-title text-lg font-bold">Clippeak</span>
      </NuxtLink>

      <div v-if="connected && mode === 'admin'" class="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border px-2 py-1.5" :class="onDemo || onTest ? 'border-st-accentBorder bg-st-accentDeep' : 'border-st-errorBorder bg-st-errorBg'" :title="onDemo ? 'Compte fictif : modifie tout ce que tu veux.' : onTest ? 'Photos et réglages à part. Ne publie pas les clips d’un ami.' : 'Vraie chaîne : tes modifications sont réelles.'">
        <span class="st-badge" :class="onDemo || onTest ? 'st-badge-violet' : 'st-badge-error'">{{ onDemo ? 'Démonstration' : onTest ? 'Chaîne de test' : 'Vrai compte' }}</span>
        <select v-if="channels.length > 1" v-model="channelId" class="st-field !min-h-10 !w-auto max-w-[280px] !py-1" aria-label="Chaîne affichée" @change="switchChannel">
          <option v-for="c in channels" :key="c.id" :value="c.id">{{ c.demo ? 'Chaîne de démonstration' : c.test ? `${c.displayName} (test)` : c.displayName }}</option>
        </select>
        <button v-if="onDemo" type="button" class="st-btn-quiet !min-h-10" :disabled="busy" @click="studio.resetDemo()">Remettre à zéro</button>
      </div>

      <div v-if="connected" class="ml-auto flex flex-wrap items-center justify-end gap-2">
        <span v-if="mode === 'streamer' && currentChannel" class="text-sm font-semibold st-muted">{{ currentChannel.displayName }}</span>
        <button v-if="view !== 'dashboard' && (studio.onboarding.value?.completed || studio.clips.value.length)" type="button" class="st-btn-ghost" @click="view = 'dashboard'">Tableau de bord</button>
        <span v-else-if="view === 'onboarding'" class="hidden items-center gap-2 text-[13px] font-semibold st-muted lg:inline-flex">Enregistré à chaque étape</span>
        <button v-if="mode === 'streamer'" type="button" class="st-btn-quiet" :disabled="busy" @click="logout">Se déconnecter</button>
        <NuxtLink v-else-if="mode === 'admin'" to="/admin" class="st-btn-ghost no-underline">← Administration</NuxtLink>
      </div>
    </header>

    <!-- Message flottant : ne decale rien, se ferme tout seul (succes) ou a la demande (erreur). -->
    <div class="pointer-events-none fixed inset-x-4 top-[76px] z-50 flex justify-end sm:left-auto sm:right-6 sm:w-[420px]" aria-live="polite">
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
      <StudioDashboard v-if="view === 'dashboard'" />
      <StudioOnboarding v-else />
    </template>
    <StudioSkeleton v-else-if="checking" />
  </div>
</template>
