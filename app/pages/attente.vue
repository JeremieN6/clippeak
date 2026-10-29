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
</script>

<template>
  <div class="st-root min-h-screen bg-st-bg">
    <header class="flex min-h-16 items-center justify-between gap-4 border-b border-st-border px-5 py-2 sm:px-8">
      <NuxtLink to="/" class="flex items-center gap-2.5 no-underline">
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
          <li>Dès que ta chaîne est invitée, il suffit de te reconnecter avec Twitch.</li>
        </ul>
      </section>

      <div class="flex flex-wrap gap-2">
        <NuxtLink to="/try-now" class="st-btn no-underline">Essayer la simulation</NuxtLink>
        <NuxtLink to="/" class="st-btn-ghost no-underline">Retour à l’accueil</NuxtLink>
      </div>
    </main>
  </div>
</template>
