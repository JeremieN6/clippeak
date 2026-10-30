<script setup lang="ts">
// « Mes données » : ce que Clippeak garde, l'export (JSON) et la suppression du compte (irreversible, avec confirmation).
const studio = useStudio()
const login = computed(() => studio.channels.value.find(c => c.id === studio.channelId.value)?.login ?? '')
const isStreamer = computed(() => studio.mode.value === 'streamer')
const confirm = ref('')
const done = ref<string[] | null>(null)

const exportHref = computed(() => `/api/studio/account/export${studio.mode.value === 'admin' ? `?channel=${studio.channelId.value}` : ''}`)
const canDelete = computed(() => isStreamer.value && confirm.value.trim().toLowerCase() === login.value.toLowerCase() && login.value !== '')

const erase = () => studio.run(async () => {
  const r = await studio.api<{ steps: string[] }>('/api/studio/account/delete', { method: 'POST', body: { confirm: confirm.value } })
  done.value = r.steps
})

const back = () => { studio.view.value = studio.onboarding.value?.completed || studio.clips.value.length ? 'dashboard' : 'onboarding' }
const leave = async () => { await studio.logout().catch(() => {}); await navigateTo('/connexion') }

const kept = [
  'Tes réglages et ton style de clips.',
  'Tes photos, tes sons, tes illustrations et tes clips de référence.',
  'Tes VODs analysées, les moments repérés et les clips générés (avec leurs titres et légendes).',
  'Le lien avec ton compte YouTube (jetons chiffrés), si tu l’as connecté.',
  'Tes votes, tes idées et tes notifications.'
]
</script>

<template>
  <main class="mx-auto flex w-full max-w-[760px] flex-col gap-7 px-5 pb-16 pt-6 sm:px-8 sm:pt-9">
    <div class="flex flex-col gap-2">
      <button type="button" class="-ml-2 inline-flex h-11 items-center gap-1.5 self-start rounded-[10px] border-0 bg-transparent px-2 text-sm font-bold text-st-muted hover:text-st-text" @click="back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        Retour
      </button>
      <h1 class="st-title m-0 text-[34px] font-extrabold leading-10">Mes données</h1>
      <p class="m-0 text-base leading-[26px] st-muted">Tu gardes la main sur tout ce que Clippeak conserve. Les photos servent uniquement à te reconnaître dans tes lives pour te cadrer ; elles restent sur nos serveurs et ne sont jamais partagées.</p>
    </div>

    <template v-if="!done">
      <section class="st-card flex flex-col gap-3.5" aria-labelledby="kept-title">
        <h2 id="kept-title" class="st-title m-0 text-xl font-bold">Ce que Clippeak garde</h2>
        <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-[22px] st-muted">
          <li v-for="k in kept" :key="k">{{ k }}</li>
        </ul>
        <div><a :href="exportHref" download class="st-btn-ghost no-underline">Télécharger mes données (JSON)</a></div>
        <p class="m-0 text-[13px] st-dim">L’export liste tes réglages, tes clips et leurs textes, sans aucun mot de passe ni jeton. Pour recevoir aussi tes fichiers (photos, vidéos), écris à contact.clippeak@sassify.fr.</p>
      </section>

      <section class="flex flex-col gap-3.5 rounded-2xl border border-st-errorBorder bg-st-errorBg p-5 sm:p-6" aria-labelledby="del-title">
        <h2 id="del-title" class="st-title m-0 text-xl font-bold text-st-error">Supprimer mon compte</h2>
        <p class="m-0 text-sm leading-[22px] text-st-soft">Tout est effacé pour de bon : tes clips, tes photos, tes fichiers, tes réglages, tes accès YouTube (l’autorisation est retirée chez Google) et l’écoute de tes lives. <strong>Impossible à annuler.</strong> Pour revenir un jour, il faudra être invité de nouveau.</p>
        <template v-if="isStreamer">
          <label for="confirm" class="text-sm font-bold">Pour confirmer, retape le nom de ta chaîne : <span class="text-st-text">{{ login }}</span></label>
          <input id="confirm" v-model="confirm" class="st-field" autocomplete="off" autocapitalize="off" spellcheck="false" :placeholder="login">
          <div><button type="button" class="st-btn !bg-st-error !text-st-bg" :disabled="!canDelete || studio.busy.value" @click="erase">Supprimer définitivement mon compte</button></div>
        </template>
        <p v-else class="m-0 text-sm st-muted">Vue administrateur : la suppression se fait depuis le compte du streamer (ou depuis « Chaînes de test » pour une chaîne de test).</p>
      </section>
    </template>

    <section v-else class="st-card flex flex-col gap-3.5" role="status">
      <h2 class="st-title m-0 text-xl font-bold">Ton compte est supprimé</h2>
      <ul class="m-0 flex list-disc flex-col gap-1 pl-5 text-sm leading-[22px] st-muted"><li v-for="s in done" :key="s">{{ s }}</li></ul>
      <p class="m-0 text-sm st-muted">Merci d’avoir essayé Clippeak. Si tu changes d’avis, écris-nous.</p>
      <div><button type="button" class="st-btn" @click="leave">Quitter</button></div>
    </section>
  </main>
</template>
