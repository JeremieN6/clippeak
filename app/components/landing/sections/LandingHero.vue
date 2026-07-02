<script setup lang="ts">
const props = defineProps<{
  primaryTargetId: string
}>()
</script>

<template>
  <section class="relative overflow-hidden rounded-3xl border border-white/10 bg-clippeak-bg/55 px-6 py-12 text-center sm:px-10 sm:py-16">
    <div class="absolute left-1/2 top-8 h-72 w-72 -translate-x-1/2 rounded-full bg-clippeak-violet/45 blur-[130px]"></div>

    <div class="relative mx-auto max-w-4xl">
      <div class="mb-5 inline-flex rounded-full border border-clippeak-violet/40 bg-clippeak-violet/10 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-white/90">
        Nouveau · Clipping automatique pour streameurs Twitch
      </div>

      <h1 class="font-display text-4xl font-extrabold leading-tight sm:text-6xl">
        Tes meilleurs moments. En clips. Automatiquement.
      </h1>

      <p class="mx-auto mt-5 max-w-3xl text-base text-clippeak-muted sm:text-lg">
        Clippeak analyse ton chat Twitch, detecte les pics de reaction, et decoupe ta VOD en clips prets a publier sur TikTok et Instagram.
      </p>

      <a
        :href="`#${props.primaryTargetId}`"
        class="mt-8 inline-flex rounded-xl bg-clippeak-violet px-7 py-3 text-sm font-semibold transition hover:bg-clippeak-violetLight"
      >
        Generer mes clips gratuitement
      </a>

      <p class="mt-3 text-sm text-white/70">Aucun compte requis · Resultat en moins de 2 minutes</p>
    </div>
  </section>
</template>
