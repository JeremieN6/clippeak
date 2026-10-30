<script setup lang="ts">
// Barre du haut du studio (maquette « Barre du haut ») : logo et statut d'enregistrement a gauche ; a droite « Prochainement » en bouton
// discret, la cloche, puis le compte dans un menu (tableau de bord, administration, deconnexion). En admin, le compte affiche
// (demonstration / test / vrai compte) et son choix de chaine s'ajoutent apres le logo.
const studio = useStudio()
const { connected, mode, view, channels, channelId, busy } = studio

const currentChannel = computed(() => channels.value.find(c => c.id === channelId.value))
const onDemo = computed(() => Boolean(currentChannel.value?.demo))
const onTest = computed(() => Boolean(currentChannel.value?.test))
const accountName = computed(() => mode.value === 'admin' ? 'Administrateur' : currentChannel.value?.displayName ?? '')
const initial = computed(() => (accountName.value || 'C').charAt(0).toUpperCase())
const canDashboard = computed(() => view.value !== 'dashboard' && Boolean(studio.onboarding.value?.completed || studio.clips.value.length))

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const away = (e: MouseEvent) => { if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false }
const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') open.value = false }
onMounted(() => { document.addEventListener('click', away); document.addEventListener('keydown', esc) })
onBeforeUnmount(() => { document.removeEventListener('click', away); document.removeEventListener('keydown', esc) })

const go = (v: 'dashboard' | 'roadmap' | 'account') => { view.value = v; open.value = false }

async function switchChannel() {
  await navigateTo({ query: { channel: channelId.value } }, { replace: true })
  await studio.switchChannel()
}
async function logout() {
  open.value = false
  await studio.logout()
  await navigateTo('/connexion')
}
</script>

<template>
  <header class="z-30 flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-st-border bg-st-bg px-3 py-1.5 sm:sticky sm:top-0 sm:min-h-16 sm:px-6">
    <div class="flex min-w-0 items-center gap-4">
      <NuxtLink to="/" class="flex min-h-11 items-center gap-2.5 text-st-text no-underline" aria-label="Clippeak, accueil">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-st-accent text-xs font-extrabold text-white" aria-hidden="true">CP</span>
        <span class="st-title text-[19px] font-bold leading-none">Clippeak</span>
      </NuxtLink>
      <template v-if="connected && view === 'onboarding'">
        <span class="hidden h-5 w-px bg-st-border lg:block" aria-hidden="true" />
        <span class="hidden items-center gap-1.5 text-[13px] font-semibold st-muted lg:inline-flex" role="status">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--st-ok)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          Enregistré à chaque réponse
        </span>
      </template>
    </div>

    <!-- Admin : on voit toujours quel compte on regarde, pour ne jamais confondre la demonstration et une vraie chaine. -->
    <div v-if="connected && mode === 'admin'" class="order-last flex min-w-0 basis-full flex-wrap items-center gap-2 rounded-xl border px-2 py-1.5 lg:order-none lg:basis-auto" :class="onDemo || onTest ? 'border-st-accentBorder bg-st-accentDeep' : 'border-st-errorBorder bg-st-errorBg'" :title="onDemo ? 'Compte fictif : modifie tout ce que tu veux.' : onTest ? 'Photos et réglages à part. Ne publie pas les clips d’un ami.' : 'Vraie chaîne : tes modifications sont réelles.'">
      <span class="st-badge" :class="onDemo || onTest ? 'st-badge-violet' : 'st-badge-error'">{{ onDemo ? 'Démonstration' : onTest ? 'Chaîne de test' : 'Vrai compte' }}</span>
      <select v-if="channels.length > 1" v-model="channelId" class="st-field !min-h-10 !w-auto max-w-[240px] !py-1" aria-label="Chaîne affichée" @change="switchChannel">
        <option v-for="c in channels" :key="c.id" :value="c.id">{{ c.demo ? 'Chaîne de démonstration' : c.test ? `${c.displayName} (test)` : c.displayName }}</option>
      </select>
      <button v-if="onDemo" type="button" class="st-btn-quiet !min-h-10" :disabled="busy" @click="studio.resetDemo()">Remettre à zéro</button>
    </div>

    <div v-if="connected" class="flex items-center gap-2">
      <button
        v-if="view !== 'roadmap'" type="button"
        class="hidden h-11 items-center gap-2 rounded-[10px] border border-st-borderStrong bg-transparent px-4 text-sm font-bold text-st-text hover:bg-st-raised sm:inline-flex"
        @click="view = 'roadmap'"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.2 5.3L20 10l-4.3 3.8L17 20l-5-3-5 3 1.3-6.2L4 10l5.8-1.7z" /></svg>
        Prochainement
      </button>
      <span v-else class="hidden h-11 items-center gap-2 rounded-[10px] border border-st-accentBorder bg-st-accentBg px-4 text-sm font-bold text-st-accentText sm:inline-flex" aria-current="page">Prochainement</span>

      <StudioBell />

      <div ref="root" class="relative">
        <button
          type="button" aria-haspopup="menu" :aria-expanded="open" :aria-label="`Menu du compte ${accountName}`"
          class="flex h-11 items-center gap-2 rounded-full border bg-st-surface pl-1.5 pr-2.5 text-sm font-bold text-st-text"
          :class="open ? 'border-st-accentLight' : 'border-st-border'" @click="open = !open"
        >
          <span class="flex h-8 w-8 items-center justify-center rounded-full bg-st-accentBg text-[13px] font-extrabold text-st-accentText" aria-hidden="true">{{ initial }}</span>
          <span class="hidden max-w-[140px] truncate sm:inline">{{ accountName }}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--st-muted)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        <div v-if="open" role="menu" class="absolute right-0 top-[52px] z-40 flex w-60 flex-col rounded-[14px] border border-st-borderStrong bg-st-raised p-1.5 shadow-[0_12px_32px_rgba(0,0,0,.45)]">
          <div class="px-3 pb-2 pt-2.5">
            <div class="text-xs font-bold text-st-dim">Connecté en tant que</div>
            <div class="truncate text-[15px] font-bold">{{ accountName }}</div>
          </div>
          <div class="mx-1.5 my-1 h-px bg-st-border" aria-hidden="true" />
          <button v-if="canDashboard" type="button" role="menuitem" class="st-menu-item" @click="go('dashboard')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h7v7H4zM13 5h7v4h-7zM13 11h7v8h-7zM4 14h7v5H4z" /></svg>
            Tableau de bord
          </button>
          <button v-if="view !== 'roadmap'" type="button" role="menuitem" class="st-menu-item sm:hidden" @click="go('roadmap')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.2 5.3L20 10l-4.3 3.8L17 20l-5-3-5 3 1.3-6.2L4 10l5.8-1.7z" /></svg>
            Prochainement
          </button>
          <button v-if="view !== 'account'" type="button" role="menuitem" class="st-menu-item" @click="go('account')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /></svg>
            Mes données
          </button>
          <NuxtLink v-if="mode === 'admin'" to="/admin" role="menuitem" class="st-menu-item no-underline">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            Administration
          </NuxtLink>
          <button v-if="mode === 'streamer'" type="button" role="menuitem" class="st-menu-item" :disabled="busy" @click="logout">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4H5v16h4M15 8l4 4-4 4M19 12H9" /></svg>
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
