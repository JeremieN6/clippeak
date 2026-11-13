<script setup lang="ts">
// Bandeau « Clippeak cherche les meilleurs moments » (maquette « Analyse en cours ») : la VOD ou le live en cours d'analyse, ce qui est deja
// lu (« 1 h 12 sur 3 h 40 analysée ») et une barre d'avancement. Se rafraichit toutes les 30 secondes tant qu'il y a quelque chose a montrer.
const studio = useStudio()
const items = computed(() => studio.analysis.value)

const duration = (sec: number) => {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${Math.max(1, m)} min`
}
const detail = (i: AnalysisItem) => {
  const title = i.title ? `Vidéo « ${i.title} »` : 'Ton live'
  if (i.analyzedSec && i.durationSec) return `${title} · ${duration(i.analyzedSec)} sur ${duration(i.durationSec)} analysée.`
  if (i.analyzedSec) return `${title} · ${duration(i.analyzedSec)} analysée jusqu’ici.`
  return `${title}.`
}
const heading = (i: AnalysisItem) => i.kind === 'long' ? 'Clippeak analyse ton live pour les extraits longs' : 'Clippeak cherche les meilleurs moments'

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  studio.loadAnalysis()
  timer = setInterval(() => { if (!studio.busy.value) studio.loadAnalysis() }, 30_000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <div v-if="items.length" class="flex flex-col gap-3" aria-label="Analyses en cours">
    <section v-for="i in items" :key="`${i.kind}-${i.id}`" class="st-alert st-alert-info st-rise !flex-col !gap-3" role="status">
      <div class="flex items-start gap-3">
        <svg class="mt-0.5 flex-none" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 109 9"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" /></path></svg>
        <div class="min-w-0 flex-1">
          <div class="text-[15px] font-extrabold">{{ heading(i) }}</div>
          <div class="mt-0.5 text-sm leading-[21px] opacity-90">{{ detail(i) }} Tu peux fermer cette page<template v-if="i.kind === 'long'">, on te prévient dans la cloche quand c’est prêt</template><template v-else>, on te prévient quand c’est prêt</template>.</div>
        </div>
      </div>
      <div class="h-2 w-full overflow-hidden rounded bg-st-raised2" role="progressbar" aria-label="Avancement de l’analyse" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="i.pct ?? undefined"><div class="st-bar h-full" :class="i.pct == null ? 'st-bar-live' : ''" :style="{ width: `${i.pct ?? 40}%` }" /></div>
    </section>
  </div>
</template>
