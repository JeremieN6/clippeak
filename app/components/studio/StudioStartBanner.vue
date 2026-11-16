<script setup lang="ts">
// « Demarrage rapide » : pour un streamer inscrit depuis moins d'une semaine, dit ou en est l'analyse de son dernier live et dans combien de
// temps arrivent ses premiers clips, SANS qu'il ait a finir l'onboarding. Le delai est une estimation (file d'attente du serveur comprise).
// Se rafraichit toutes les 30 secondes ; quand les premiers clips arrivent, la liste des clips est relue.
const props = withDefaults(defineProps<{ onboarding?: boolean, active?: boolean }>(), { active: true })
const studio = useStudio()
const p = computed(() => studio.startProgress.value)
const shown = computed(() => Boolean(p.value?.fresh) && p.value?.phase !== 'ready' && p.value?.phase !== 'paused')
const working = computed(() => p.value?.phase === 'waiting' || p.value?.phase === 'analyzing' || p.value?.phase === 'rendering')
const warn = computed(() => p.value?.phase === 'blocked' || p.value?.phase === 'failed')

let timer: ReturnType<typeof setInterval> | null = null
let last = ''
async function refresh() {
  await studio.loadStartProgress()
  const phase = studio.startProgress.value?.phase ?? ''
  if (phase === 'ready' && last && last !== 'ready') await studio.loadClips()
  last = phase
}
onMounted(() => {
  refresh()
  timer = setInterval(() => { if (!studio.busy.value) refresh() }, 30_000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <section v-if="p && shown && props.active" class="st-alert st-rise !flex-col !items-start !gap-2.5" :class="warn ? 'st-alert-warn' : 'st-alert-info'" role="status" aria-label="Démarrage rapide">
    <div class="flex items-start gap-3">
      <svg v-if="working" class="mt-0.5 flex-none" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 109 9"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" /></path></svg>
      <div class="min-w-0 flex-1">
        <div class="text-[15px] font-extrabold">{{ p.title }}</div>
        <div class="mt-0.5 text-sm leading-[21px] opacity-90">{{ p.text }}</div>
        <div v-if="working" class="mt-1 text-[13px] opacity-80">C’est une estimation : elle s’allonge si beaucoup de streamers démarrent en même temps.</div>
      </div>
    </div>
    <div v-if="working" class="h-2 w-full overflow-hidden rounded bg-st-raised2" role="progressbar" aria-label="Préparation de tes premiers clips"><div class="st-bar st-bar-live h-full" style="width: 40%" /></div>
    <p v-if="onboarding && working" class="m-0 text-[13px] opacity-90">Pas besoin de finir les étapes ci-dessous pour ça : elles servent à personnaliser tes clips, tu peux les faire pendant l’attente ou plus tard.</p>
    <button v-if="onboarding" type="button" class="st-btn-ghost" @click="studio.view.value = 'dashboard'">Voir mon tableau de bord</button>
  </section>
</template>
