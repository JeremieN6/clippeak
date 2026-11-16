<script setup lang="ts">
// Écran « Mon offre » (Gratuit) / « Mon abonnement » (Creator) : ouvert depuis la colonne de gauche ou le menu du compte.
const studio = useStudio()
const back = () => { studio.view.value = studio.onboarding.value?.completed || studio.clips.value.length ? 'dashboard' : 'onboarding' }
const creator = computed(() => studio.billing.value?.plan === 'creator')
</script>

<template>
  <main class="mx-auto flex w-full max-w-[880px] flex-col gap-7 px-5 pb-16 pt-6 sm:px-8 sm:pt-9">
    <div class="flex max-w-[640px] flex-col gap-2">
      <button type="button" class="-ml-2 inline-flex h-11 items-center gap-1.5 self-start rounded-[10px] border-0 bg-transparent px-2 text-sm font-bold text-st-muted hover:text-st-text" @click="back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        Retour
      </button>
      <h1 class="st-title m-0 text-[34px] font-extrabold leading-10">{{ creator ? 'Mon abonnement' : 'Mon offre' }}</h1>
    </div>
    <StudioBilling />
    <div v-if="!studio.billing.value?.available" class="st-alert st-alert-info" role="status">Les offres ne sont pas disponibles pour le moment.</div>
  </main>
</template>
