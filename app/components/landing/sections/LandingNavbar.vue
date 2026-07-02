<script setup lang="ts">
const props = defineProps<{
  links: Array<{ href: string; label: string }>
  primaryHref: string
}>()
</script>

<template>
  <header class="sticky top-4 z-30 mb-8 rounded-2xl border border-white/10 bg-black/45 px-4 py-3 backdrop-blur-lg sm:px-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
        <a href="/">
        <div class="flex items-center gap-3">
            <div class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-clippeak-violet font-display font-bold">CP</div>
            <span class="font-display text-lg font-bold">Clippeak</span>
        </div>
        </a>

      <nav class="flex flex-wrap items-center gap-2">
        <a
          v-for="link in props.links"
          :key="link.href"
          :href="link.href"
          class="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:border-clippeak-violet/40 hover:text-white"
        >
          {{ link.label }}
        </a>
      </nav>

        <a
        :href="props.primaryHref"
        class="rounded-xl bg-clippeak-violet px-4 py-2 text-sm font-semibold transition hover:bg-clippeak-violetLight"
      >
        Essayer maintenant
      </a>
    </div>
  </header>
</template>
