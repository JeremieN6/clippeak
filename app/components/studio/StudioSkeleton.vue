<script setup lang="ts">
// Chargement du studio : la forme du tableau de bord en gris, a la place d'un simple « Chargement… ».
</script>

<template>
  <div class="flex flex-wrap items-stretch" role="status" aria-busy="true">
    <span class="sr-only">Chargement de ton studio…</span>
    <div class="hidden w-[280px] flex-none flex-col gap-3 border-r border-st-border p-4 py-6 lg:flex" aria-hidden="true">
      <div v-for="n in 7" :key="n" class="st-skel h-11 rounded-[10px]" />
    </div>
    <div class="flex min-w-0 flex-[999_1_620px] flex-col gap-7 px-5 py-8 sm:px-10" aria-hidden="true">
      <div class="st-skel h-9 w-56 rounded-[10px]" />
      <div class="st-skel h-36 rounded-2xl" />
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div v-for="n in 5" :key="n" class="st-skel h-[84px] rounded-[14px]" />
      </div>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] gap-4">
        <div v-for="n in 2" :key="n" class="st-skel h-72 rounded-2xl" />
      </div>
    </div>
  </div>
</template>
