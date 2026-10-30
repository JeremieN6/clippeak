<script setup lang="ts">
// Page d'attente : un streamer non invite qui se connecte avec Twitch (par exemple via un lien transmis par un ami) arrive ici
// au lieu d'une erreur. Rien n'a ete cree pour lui.
useHead({ title: 'Accès sur invitation – Clippeak', meta: [{ name: 'robots', content: 'noindex' }] })

const route = useRoute()
// Pseudo Twitch renvoye par le serveur : on n'affiche que ce qui ressemble a un pseudo.
const login = computed(() => {
  const raw = String(route.query.login ?? '')
  return /^[A-Za-z0-9_]{3,25}$/.test(raw) ? raw : ''
})

// « Previens-moi » : enregistre la demande seulement au clic (l'identite vient du cookie signe pose au retour de Twitch).
const state = ref<'idle' | 'sending' | 'done' | 'invited' | 'error'>('idle')
const problem = ref('')
async function ask() {
  state.value = 'sending'
  problem.value = ''
  try {
    const res = await $fetch<{ invited: boolean }>('/api/auth/access-request', { method: 'POST' })
    state.value = res.invited ? 'invited' : 'done'
  } catch (e: any) {
    problem.value = e?.data?.statusMessage || 'Impossible d’envoyer la demande pour le moment.'
    state.value = 'error'
  }
}
</script>

<template>
  <div class="st-root min-h-screen bg-st-bg">
    <header class="flex min-h-16 items-center justify-between gap-4 border-b border-st-border px-5 py-2 sm:px-8">
      <NuxtLink to="/" class="flex min-h-11 items-center gap-2.5 text-st-text no-underline">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-st-accent text-xs font-extrabold text-white" aria-hidden="true">CP</span>
        <span class="st-title text-lg font-bold">Clippeak</span>
      </NuxtLink>
    </header>

    <main class="mx-auto flex max-w-md flex-col gap-6 px-5 py-16">
      <span class="st-badge st-badge-violet self-start">Bêta sur invitation</span>
      <div class="flex flex-col gap-3">
        <h1 class="st-title m-0 text-3xl font-bold">Ton accès n’est pas encore ouvert</h1>
        <p class="m-0 text-sm leading-relaxed st-muted">
          <template v-if="login">Merci d’être passé, <strong class="text-white">{{ login }}</strong>. </template>
          Clippeak ouvre ses accès par petits groupes, pour que chaque streamer ait des clips rapides et soignés. Ta chaîne n’est pas encore dans la liste : ce n’est pas un refus, juste une question de place.
        </p>
      </div>

      <section class="st-card flex flex-col gap-3">
        <h2 class="m-0 text-[17px] font-bold">Et maintenant ?</h2>
        <ul class="m-0 flex list-none flex-col gap-2 p-0 text-sm leading-relaxed st-muted">
          <li>Aucun compte n’a été créé et rien n’a été enregistré sur ta chaîne.</li>
          <li>Demande une invitation à la personne qui t’a partagé le lien : elle connaît l’équipe.</li>
          <li>Ou clique ci-dessous : on garde ton pseudo Twitch pour t’inviter dès qu’une place s’ouvre.</li>
          <li>Dès que ta chaîne est invitée, il suffit de te reconnecter avec Twitch.</li>
        </ul>
      </section>

      <section v-if="login" class="flex flex-col gap-2">
        <button v-if="state === 'idle' || state === 'sending' || state === 'error'" type="button" class="st-btn self-start" :disabled="state === 'sending'" @click="ask">Prévenez-moi quand une place s’ouvre</button>
        <p v-if="state === 'done'" class="m-0 text-sm text-st-ok" role="status">C’est noté : on garde ton pseudo Twitch ({{ login }}) pour t’inviter. Tu peux le faire effacer en écrivant à contact.clippeak@sassify.fr.</p>
        <p v-if="state === 'invited'" class="m-0 text-sm text-st-ok" role="status">Bonne nouvelle : ta chaîne est invitée. Reconnecte-toi avec Twitch.</p>
        <p v-if="state === 'error'" class="m-0 text-sm text-st-error" role="alert">{{ problem }}</p>
        <p class="m-0 text-xs st-muted">Seul ton pseudo Twitch est conservé, pour 90 jours au plus. <NuxtLink to="/confidentialite" class="underline">Politique de confidentialité</NuxtLink></p>
      </section>

      <div class="flex flex-wrap gap-2">
        <NuxtLink to="/try-now" class="st-btn no-underline">Essayer la simulation</NuxtLink>
        <NuxtLink to="/" class="st-btn-ghost no-underline">Retour à l’accueil</NuxtLink>
      </div>
    </main>
  </div>
</template>
