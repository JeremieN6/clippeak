<script setup lang="ts">
// Bandeau « Clippeak cherche les meilleurs moments » (maquette « Analyse en cours ») : la VOD ou le live en cours d'analyse, ce qui est deja
// lu (« 1 h 12 sur 3 h 40 analysée ») et une barre d'avancement. Se rafraichit toutes les 30 secondes tant qu'il y a quelque chose a montrer.
const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
const studio = useStudio()
const items = computed(() => studio.analysis.value)
// Une seule zone d'avancement a la fois : on montre l'analyse la plus ancienne.
const item = computed(() => items.value[0] ?? null)
const active = computed(() => props.active)

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
  <section v-if="active && item" class="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[14px] border border-[#2D4A7A] bg-st-infoBg px-4 py-3 st-rise" role="status" aria-label="Analyse du live en cours">
    <svg class="flex-none text-st-info" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 109 9"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" /></path></svg>
    <div class="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
      <div class="text-sm font-extrabold leading-5 text-st-info">{{ heading(item) }}<template v-if="item.pct != null"> · environ {{ item.pct }} %</template></div>
      <div class="text-[13px] leading-[19px] opacity-90">{{ detail(item) }} Tu peux fermer cette page<template v-if="item.kind === 'long'">, on te prévient dans la cloche quand c’est prêt</template><template v-else>, on te prévient quand c’est prêt</template>.</div>
    </div>
    <div class="h-1.5 w-full flex-none overflow-hidden rounded-[3px] bg-st-raised2 sm:w-[180px]" role="progressbar" aria-label="Avancement de l’analyse" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="item.pct ?? undefined"><div class="st-bar h-full" :class="item.pct == null ? 'st-bar-live' : ''" :style="{ width: `${item.pct ?? 40}%` }" /></div>
  </section>
</template>
