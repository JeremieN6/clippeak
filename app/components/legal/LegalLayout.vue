<script setup lang="ts">
// Habillage commun des pages legales : en-tete, titre, date de mise a jour, texte lisible.
defineProps<{ title: string, updated: string }>()
</script>

<template>
  <div class="st-root min-h-screen bg-[#0E0D12]">
    <header class="flex min-h-16 items-center justify-between gap-4 border-b border-[#2C2837] px-5 py-2 sm:px-8">
      <NuxtLink to="/" class="flex items-center gap-2.5 no-underline">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-[#7C3AED] text-xs font-extrabold text-white" aria-hidden="true">CP</span>
        <span class="st-title text-lg font-bold">Clippeak</span>
      </NuxtLink>
      <nav class="flex gap-4 text-sm" aria-label="Pages légales">
        <NuxtLink to="/confidentialite" class="st-muted hover:text-white">Confidentialité</NuxtLink>
        <NuxtLink to="/conditions" class="st-muted hover:text-white">Conditions</NuxtLink>
      </nav>
    </header>

    <main class="mx-auto flex max-w-[720px] flex-col gap-3 px-5 py-12 sm:px-8">
      <h1 class="st-title m-0 text-3xl font-bold leading-tight sm:text-4xl">{{ title }}</h1>
      <p class="st-hint m-0">Dernière mise à jour : {{ updated }}</p>
      <div class="legal mt-4 flex flex-col gap-4 text-[15px] leading-7 text-[#D9D4E5]">
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.legal :deep(h2) { margin: 20px 0 0; font-family: 'Sora', 'Manrope', system-ui, sans-serif; font-size: 20px; font-weight: 700; color: #fff; }
.legal :deep(p), .legal :deep(ul) { margin: 0; }
.legal :deep(ul) { padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
.legal :deep(a) { color: #B9A0FF; text-decoration: underline; }
</style>
