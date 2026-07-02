<script setup lang="ts">
const logos = ['Twitch Labs', 'Nova Stream', 'ReelForge', 'Creator Hub', 'Clip Society']
</script>

<template>
  <section>
    <p class="text-center text-xs uppercase tracking-[0.25em] text-white/50">Ils testent deja Clippeak</p>
    <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <div
        v-for="logo in logos"
        :key="logo"
        class="flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-white/75"
      >
        {{ logo }}
      </div>
    </div>
  </section>
</template>
