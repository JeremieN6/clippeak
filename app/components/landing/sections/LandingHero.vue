<script setup lang="ts">
const props = defineProps<{
  primaryHref: string
}>()
</script>

<style>
.accent {
  color: rgb(143, 90, 235);
}
</style>

<template>
  <section class="relative overflow-hidden px-1 py-12 text-center sm:py-20">
    <div class="absolute left-1/2 top-1/3 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-clippeak-violet/40 blur-[150px]"></div>

    <div class="relative mx-auto max-w-4xl">
      <div class="mb-5 inline-flex rounded-full border border-clippeak-violet/40 bg-clippeak-violet/10 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-white/90">
        Nouveau · Clipping automatique pour streameurs Twitch
      </div>
        <h1 class="font-display text-4xl font-extrabold leading-tight sm:text-6xl">
          Tes <span class="accent">meilleurs moments</span>. <br> En <span class="accent">clips</span>. Automatiquement.
        </h1>

        <p class="mx-auto mt-5 max-w-3xl text-base text-clippeak-muted sm:text-lg">
          Clippeak analyse ton chat Twitch, détecte les pics de réaction, et découpe ta VOD en clips prêts à publier sur TikTok, Instagram et Youtube Short.
        </p>

        <a
          :href="props.primaryHref"
          class="mt-8 inline-flex rounded-xl bg-clippeak-violet px-7 py-3 text-sm font-semibold transition hover:bg-clippeak-violetLight"
        >
          Générer mes clips gratuitement
        </a>

        <p class="mt-3 text-sm text-white/70">Aucun compte requis · Résultat en moins de 2 minutes</p>
    </div>
  </section>
</template>
