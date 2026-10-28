<script setup lang="ts">
defineProps<{ n: number, tag: string, title: string }>()
</script>

<template>
  <header class="st-rise flex flex-col gap-2.5">
    <div class="st-eyebrow">Étape {{ n }}{{ tag ? ` · ${tag}` : '' }}</div>
    <h1 class="st-title m-0 text-[28px] font-bold leading-tight sm:text-[32px]">{{ title }}</h1>
    <p class="m-0 max-w-[560px] text-base leading-relaxed st-muted"><slot /></p>
  </header>
</template>
