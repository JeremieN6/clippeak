<script setup lang="ts">
// Bandeau de consentement a la mesure d'audience. « Accepter » et « Refuser » ont le meme poids (refuser est aussi simple qu'accepter) ;
// tant que le visiteur n'a pas choisi, rien n'est mesure. Absent de /admin (l'administration n'est pas mesuree).
const consent = useConsent()
const route = useRoute()
const visible = computed(() => consent.ready.value && consent.state.value === 'pending' && !route.path.startsWith('/admin'))
</script>

<template>
  <section v-if="visible" class="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl rounded-2xl border border-white/20 bg-[#14121c] p-4 text-white sm:bottom-5" role="dialog" aria-labelledby="cookie-title" aria-describedby="cookie-text">
    <h2 id="cookie-title" class="m-0 text-base font-bold">Mesure d’audience</h2>
    <p id="cookie-text" class="mb-3 mt-1.5 text-sm leading-6 text-white/80">
      Clippeak voudrait mesurer comment le site est utilisé (pages vues, étapes du parcours) avec PostHog, pour l’améliorer. Cela utilise le stockage de ton navigateur. Rien n’est enregistré sans ton accord, et tu peux changer d’avis à tout moment.
      <NuxtLink to="/confidentialite#cookies" class="font-semibold text-white underline">En savoir plus</NuxtLink>
    </p>
    <div class="flex flex-wrap gap-2.5">
      <button type="button" class="min-h-11 flex-1 rounded-xl bg-white/15 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/25" @click="consent.refuse()">Refuser</button>
      <button type="button" class="min-h-11 flex-1 rounded-xl bg-clippeak-violet px-5 py-2.5 text-sm font-semibold text-white hover:bg-clippeak-violetLight" @click="consent.accept()">Accepter</button>
    </div>
  </section>
</template>
