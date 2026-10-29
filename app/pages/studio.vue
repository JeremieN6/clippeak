<script setup lang="ts">
// Espace du streamer : parcours guide en 8 etapes puis tableau de bord de contenu. On y entre connecte avec Twitch (/connexion).
// L'admin y arrive depuis /admin (session admin) : il voit la chaine de demonstration par defaut, sans toucher a un vrai compte.
useHead({ title: 'Studio Clippeak', meta: [{ name: 'robots', content: 'noindex' }] })

const studio = createStudio()
provide(STUDIO_KEY, studio)

const { connected, error, notice, busy, channels, channelId, view, mode } = studio

const route = useRoute()
const checking = ref(true)
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
  <div class="st-root min-h-screen bg-[#0E0D12]">
    <header class="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#2C2837] px-5 py-2 sm:px-8">
      <div class="flex items-center gap-2.5">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-[#7C3AED] text-xs font-extrabold text-white" aria-hidden="true">CP</span>
        <span class="st-title text-lg font-bold">Clippeak</span>
      </div>
      <div v-if="connected" class="flex flex-wrap items-center justify-end gap-2">
        <span v-if="mode === 'streamer' && currentChannel" class="text-sm font-semibold st-muted">{{ currentChannel.displayName }}</span>
        <button v-if="view !== 'dashboard' && (studio.onboarding.value?.completed || studio.clips.value.length)" type="button" class="st-btn-ghost" @click="view = 'dashboard'">Tableau de bord</button>
        <span v-else-if="view === 'onboarding'" class="hidden items-center gap-2 text-[13px] font-semibold st-muted sm:inline-flex">Enregistré à chaque étape</span>
        <button v-if="mode === 'streamer'" type="button" class="st-btn-quiet" :disabled="busy" @click="logout">Se déconnecter</button>
      </div>
    </header>

    <!-- Admin : on voit toujours quel compte on regarde, pour ne jamais confondre la demonstration et une vraie chaine. -->
    <div
      v-if="connected && mode === 'admin'"
      class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-2.5 sm:px-8"
      :class="onDemo || onTest ? 'border-[#3A2A66] bg-[#1A1530]' : 'border-[#6B2F26] bg-[#2A1512]'"
      role="status"
    >
      <span class="st-badge" :class="onDemo || onTest ? 'st-badge-violet' : 'st-badge-error'">{{ onDemo ? 'Démonstration' : onTest ? 'Chaîne de test' : 'Vrai compte' }}</span>
      <span class="text-[13px] leading-5">
        {{ onDemo ? 'Tu es en mode administrateur sur un compte fictif : modifie tout ce que tu veux.' : onTest ? 'Chaîne de test : ses photos et ses réglages sont à part. Ne publie pas les clips d’un ami.' : 'Tu es en mode administrateur sur une vraie chaîne : tes modifications sont réelles.' }}
      </span>
      <select v-if="channels.length > 1" v-model="channelId" class="st-field !w-auto" aria-label="Chaîne affichée" @change="switchChannel">
        <option v-for="c in channels" :key="c.id" :value="c.id">{{ c.demo ? 'Chaîne de démonstration' : c.test ? `${c.displayName} (test)` : c.displayName }}</option>
      </select>
      <button v-if="onDemo" type="button" class="st-btn-ghost" :disabled="busy" @click="studio.resetDemo()">Remettre à zéro</button>
      <NuxtLink to="/admin" class="st-btn-quiet no-underline sm:ml-auto">← Administration</NuxtLink>
    </div>

    <div v-if="error || notice" class="px-5 pt-4 sm:px-8">
      <p v-if="error" class="st-alert st-alert-error m-0" role="alert">{{ error }}</p>
      <p v-else class="st-alert st-alert-ok m-0" role="status">{{ notice }}</p>
    </div>

    <StudioVodAlerts v-if="connected && studio.detail.value" />

    <template v-if="connected && studio.detail.value">
      <StudioDashboard v-if="view === 'dashboard'" />
      <StudioOnboarding v-else />
    </template>
    <p v-else-if="checking" class="px-5 py-16 text-center text-sm st-muted" role="status">Chargement…</p>
  </div>
</template>
