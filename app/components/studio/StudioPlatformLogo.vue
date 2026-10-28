<script setup lang="ts">
// Logos des plateformes (SVG en ligne, decoratifs : le nom est ecrit a cote). Sert a identifier la plateforme, rien d'autre.
defineProps<{ id: string }>()
</script>

<template>
  <svg v-if="id === 'tiktok'" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="#25F4EE" transform="translate(-0.9 0.9)" d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.7 5.7 0 1 0 4.9 5.7V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6z" />
    <path fill="#FE2C55" transform="translate(0.9 -0.9)" d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.7 5.7 0 1 0 4.9 5.7V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6z" />
    <path fill="#fff" d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.7 5.7 0 1 0 4.9 5.7V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6z" />
  </svg>
  <svg v-else-if="id === 'instagram'" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient :id="`ig-${id}`" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="#FEDA75" /><stop offset=".35" stop-color="#FA7E1E" /><stop offset=".6" stop-color="#D62976" /><stop offset=".85" stop-color="#962FBF" /><stop offset="1" stop-color="#4F5BD5" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="20" height="20" rx="6" :fill="`url(#ig-${id})`" />
    <rect x="5.2" y="5.2" width="13.6" height="13.6" rx="4.2" fill="none" stroke="#fff" stroke-width="1.8" />
    <circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="1.8" />
    <circle cx="16.4" cy="7.6" r="1.1" fill="#fff" />
  </svg>
  <svg v-else-if="id === 'youtube'" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="1.5" y="4.5" width="21" height="15" rx="4.5" fill="#FF0000" />
    <path d="M10 8.9v6.2l5.3-3.1z" fill="#fff" />
  </svg>
</template>
