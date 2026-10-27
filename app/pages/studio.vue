<script setup lang="ts">
// Espace du streamer : connexion avec Twitch (sur invitation), parcours guide en 8 etapes puis tableau de bord de contenu.
// L'admin garde un acces par mot de passe (en memoire, envoye dans l'en-tete, jamais dans l'URL) pour tout voir et gerer les invitations.
useHead({ title: 'Studio Clippeak' })

const studio = createStudio()
provide(STUDIO_KEY, studio)

const { password, connected, error, notice, busy, channels, channelId, view, mode } = studio

const route = useRoute()
const loginMessages: Record<string, string> = {
  refused: 'Cette chaîne Twitch n’est pas encore invitée. Clippeak est en accès sur invitation : demande à être invité.',
  error: 'La connexion avec Twitch a échoué. Réessaie dans un instant.',
  cancelled: 'Connexion annulée.'
}
const loginMessage = computed(() => loginMessages[String(route.query.login ?? '')] ?? '')
const showAdmin = ref(false)
const checking = ref(true)

onMounted(async () => {
  await studio.restoreSession()
  checking.value = false
})
</script>

<template>
  <div class="st-root min-h-screen bg-[#0E0D12]">
    <header class="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#2C2837] px-5 py-2 sm:px-8">
      <div class="flex items-center gap-2.5">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-[#7C3AED] text-xs font-extrabold text-white" aria-hidden="true">CP</span>
        <span class="st-title text-lg font-bold">Clippeak</span>
      </div>
      <div v-if="connected" class="flex flex-wrap items-center justify-end gap-2">
        <select v-if="mode === 'admin' && channels.length > 1" v-model="channelId" class="st-field !w-auto" aria-label="Streamer" @change="studio.switchChannel()">
          <option v-for="c in channels" :key="c.id" :value="c.id">{{ c.displayName }}</option>
        </select>
        <span v-else-if="channels[0]" class="text-sm font-semibold st-muted">{{ channels[0].displayName }}{{ mode === 'admin' ? ' (admin)' : '' }}</span>
        <button v-if="mode === 'admin'" type="button" class="st-btn-ghost" @click="view = 'invites'; studio.loadInvites()">Invitations</button>
        <button v-if="view !== 'dashboard' && studio.onboarding.value?.completed" type="button" class="st-btn-ghost" @click="view = 'dashboard'">Tableau de bord</button>
        <span v-else-if="view === 'onboarding'" class="hidden items-center gap-2 text-[13px] font-semibold st-muted sm:inline-flex">Enregistré à chaque étape</span>
        <button type="button" class="st-btn-quiet" :disabled="busy" @click="studio.logout()">Se déconnecter</button>
      </div>
    </header>

    <div v-if="error || notice" class="px-5 pt-4 sm:px-8">
      <p v-if="error" class="st-alert st-alert-error m-0" role="alert">{{ error }}</p>
      <p v-else class="st-alert st-alert-ok m-0" role="status">{{ notice }}</p>
    </div>

    <main v-if="!connected" class="mx-auto flex max-w-md flex-col gap-6 px-5 py-16">
      <template v-if="!checking">
        <div class="flex flex-col gap-2">
          <h1 class="st-title m-0 text-3xl font-bold">Studio Clippeak</h1>
          <p class="m-0 text-sm leading-relaxed st-muted">Connecte-toi avec ton compte Twitch pour régler ton look et valider tes clips. Rien n’est publié sans ton accord.</p>
        </div>
        <p v-if="loginMessage" class="st-alert st-alert-warn m-0" role="alert">{{ loginMessage }}</p>
        <a href="/api/auth/twitch" class="st-btn st-btn-lg w-full !bg-[#9146FF] no-underline hover:!bg-[#A970FF]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.3 3 3 6.4V19h4.3v2.3H10L12.3 19h3.4L21 13.7V3H4.3zm14.9 9.7-3 3h-4.4l-2.3 2.3v-2.3H7.3V4.7h11.9v8zM16.4 7.4h-1.7v4.7h1.7V7.4zm-4.5 0h-1.7v4.7h1.7V7.4z" /></svg>
          Se connecter avec Twitch
        </a>
        <p class="m-0 text-[13px] leading-5 st-muted">Clippeak lit seulement ton pseudo et ton identifiant Twitch. Aucune permission supplémentaire n’est demandée, et on ne publie rien sur ta chaîne.</p>

        <div class="border-t border-[#2C2837] pt-5">
          <button type="button" class="st-btn-quiet !px-0 text-sm" :aria-expanded="showAdmin" @click="showAdmin = !showAdmin">Accès administrateur</button>
          <form v-if="showAdmin" class="mt-3 flex flex-col gap-3" @submit.prevent="studio.connect()">
            <label for="st-password" class="st-label">Mot de passe administrateur</label>
            <input id="st-password" v-model="password" type="password" autocomplete="current-password" class="st-field">
            <button type="submit" class="st-btn-ghost" :disabled="busy || !password">Se connecter</button>
          </form>
        </div>
      </template>
    </main>

    <template v-else-if="studio.detail.value || view === 'invites'">
      <StudioInvites v-if="view === 'invites'" />
      <StudioDashboard v-else-if="view === 'dashboard'" />
      <StudioOnboarding v-else />
    </template>
  </div>
</template>
