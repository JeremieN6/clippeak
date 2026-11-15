<script setup lang="ts">
// Capacite du serveur : est-ce que Clippeak va ralentir quand les streamers arrivent ? Charge, memoire, files d'attente, temps de rendu et
// d'analyse, courbe des dernieres 24 h et un conseil en clair. Les mesures viennent du worker (une par minute) ; la page se rafraichit seule.
interface Latest { at: string, load1: number, load5: number, cores: number, memTotalMb: number, memFreeMb: number, clipsQueued: number, clipsRendering: number, analysesQueued: number, analysesRunning: number, oldestWaitSec: number | null, verdict: 'ok' | 'attention' | 'sature' | null }
interface Stat { n: number, medianSec: number | null, p90Sec: number | null, maxSec: number | null }
interface Capacity { latest: Latest | null, silent: boolean, series: Array<{ at: string, load1: number, cores: number }>, render: Stat & { perDay: number }, wait: Stat, analysis: { n: number, audioSec: number, workSec: number, speed: number | null }, samples7d: number, saturatedShare: number | null, recommendation: string, upgradeRule: string }

const data = ref<Capacity | null>(null)
const failed = ref(false)
async function load() {
  try { data.value = await $fetch<Capacity>('/api/admin/capacity'); failed.value = false } catch { failed.value = true }
}
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { load(); timer = setInterval(load, 60_000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

const num = (n: number, d = 1) => n.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d })
const duration = (sec: number | null) => sec === null ? '—' : sec < 90 ? `${Math.round(sec)} s` : `${num(sec / 60)} min`
const gb = (mb: number) => `${num(mb / 1024)} Go`

const latest = computed(() => data.value?.latest ?? null)
const verdictLabel = computed(() => latest.value?.verdict === 'sature' ? 'Saturé' : latest.value?.verdict === 'attention' ? 'À surveiller' : latest.value?.verdict === 'ok' ? 'Tout va bien' : 'Pas de mesure')
const verdictClass = computed(() => latest.value?.verdict === 'sature' ? 'st-badge-error' : latest.value?.verdict === 'attention' ? 'st-badge-warn' : latest.value?.verdict === 'ok' ? 'st-badge-ok' : 'st-badge-neutral')

// Courbe SVG : charge par quart d'heure, avec le nombre de coeurs et le seuil critique (1,5 fois).
const W = 640
const H = 140
const chart = computed(() => {
  const s = data.value?.series ?? []
  if (s.length < 2) return null
  const cores = s[s.length - 1]!.cores
  const top = Math.max(2 * cores, ...s.map(p => p.load1)) * 1.05
  const t0 = new Date(s[0]!.at).getTime()
  const t1 = new Date(s[s.length - 1]!.at).getTime()
  const x = (iso: string) => ((new Date(iso).getTime() - t0) / Math.max(1, t1 - t0)) * W
  const y = (v: number) => H - (v / top) * H
  return { points: s.map(p => `${x(p.at).toFixed(1)},${y(p.load1).toFixed(1)}`).join(' '), yCores: y(cores), yCrit: y(cores * 1.5), cores }
})
</script>

<template>
  <section class="flex flex-col gap-5" aria-label="Capacité du serveur">
    <p v-if="failed" class="st-alert st-alert-error m-0" role="alert">Impossible de lire les mesures du serveur pour le moment.</p>

    <template v-else-if="data">
      <div class="st-card flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="st-title m-0 text-lg font-bold">Le serveur</h2>
          <span class="st-badge" :class="verdictClass">{{ verdictLabel }}</span>
          <span v-if="data.silent" class="st-badge st-badge-warn">Pas de mesure depuis plus de 5 minutes : le worker est peut-être arrêté</span>
          <button type="button" class="st-btn-quiet ml-auto" @click="load">Actualiser</button>
        </div>
        <p class="m-0 text-sm leading-relaxed">{{ data.recommendation }}</p>
        <p class="m-0 text-[13px] leading-5 st-muted">{{ data.upgradeRule }}</p>
      </div>

      <div v-if="latest" class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div class="st-card flex flex-col gap-1 !p-4">
          <div class="st-label">Charge (tout le serveur)</div>
          <div class="text-2xl font-bold">{{ num(latest.load1, 2) }} <span class="text-sm font-semibold st-muted">pour {{ latest.cores }} cœurs</span></div>
          <div class="text-[13px] st-muted">Sur 5 minutes : {{ num(latest.load5, 2) }}. Au-dessus de {{ num(latest.cores * 1.5, 1) }}, tout ralentit.</div>
        </div>
        <div class="st-card flex flex-col gap-1 !p-4">
          <div class="st-label">Mémoire disponible</div>
          <div class="text-2xl font-bold">{{ gb(latest.memFreeMb) }} <span class="text-sm font-semibold st-muted">sur {{ gb(latest.memTotalMb) }}</span></div>
        </div>
        <div class="st-card flex flex-col gap-1 !p-4">
          <div class="st-label">File de rendu</div>
          <div class="text-2xl font-bold">{{ latest.clipsQueued }} <span class="text-sm font-semibold st-muted">en attente, {{ latest.clipsRendering }} en cours</span></div>
          <div class="text-[13px] st-muted">Plus ancien : {{ duration(latest.oldestWaitSec) }}</div>
        </div>
        <div class="st-card flex flex-col gap-1 !p-4">
          <div class="st-label">Analyses de live</div>
          <div class="text-2xl font-bold">{{ latest.analysesQueued + latest.analysesRunning }} <span class="text-sm font-semibold st-muted">({{ latest.analysesRunning }} en cours)</span></div>
        </div>
      </div>
      <p v-else class="st-alert st-alert-warn m-0" role="status">Aucune mesure pour l’instant : le worker en enregistre une par minute (après le prochain déploiement).</p>

      <div v-if="chart" class="st-card flex flex-col gap-2">
        <h3 class="st-title m-0 text-base font-bold">Charge des dernières 24 heures</h3>
        <svg :viewBox="`0 0 ${W} ${H}`" class="h-36 w-full" role="img" aria-label="Courbe de la charge du serveur sur 24 heures">
          <line x1="0" :x2="W" :y1="chart.yCrit" :y2="chart.yCrit" stroke="#F09595" stroke-dasharray="4 4" stroke-width="1" />
          <line x1="0" :x2="W" :y1="chart.yCores" :y2="chart.yCores" stroke="#F6C260" stroke-dasharray="4 4" stroke-width="1" />
          <polyline :points="chart.points" fill="none" stroke="#B9A0FF" stroke-width="2" stroke-linejoin="round" />
        </svg>
        <div class="flex flex-wrap gap-x-4 text-[13px] st-muted"><span>Violet : charge</span><span>Ambre : {{ chart.cores }} cœurs</span><span>Rouge : seuil critique ({{ num(chart.cores * 1.5, 1) }})</span></div>
      </div>

      <div class="st-card flex flex-col gap-3">
        <h3 class="st-title m-0 text-base font-bold">Sur 7 jours</h3>
        <dl class="m-0 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-6 gap-y-3 text-sm">
          <div><dt class="st-muted">Temps de rendu d’un clip</dt><dd class="m-0 font-bold">{{ data.render.n ? `médian ${duration(data.render.medianSec)}, 9 sur 10 sous ${duration(data.render.p90Sec)}` : 'pas encore de clip' }}</dd></div>
          <div><dt class="st-muted">Attente avant le rendu</dt><dd class="m-0 font-bold">{{ data.wait.n ? `médiane ${duration(data.wait.medianSec)}, 9 sur 10 sous ${duration(data.wait.p90Sec)}` : '—' }}</dd></div>
          <div><dt class="st-muted">Clips rendus</dt><dd class="m-0 font-bold">{{ data.render.n }} ({{ num(data.render.perDay) }} par jour)</dd></div>
          <div><dt class="st-muted">Vitesse d’analyse d’un live</dt><dd class="m-0 font-bold">{{ data.analysis.speed ? `${num(data.analysis.speed, 2)} × le temps réel (${data.analysis.n} analyse${data.analysis.n > 1 ? 's' : ''}, 30 jours)` : 'pas encore d’analyse terminée' }}</dd></div>
          <div><dt class="st-muted">Temps passé saturé</dt><dd class="m-0 font-bold">{{ data.saturatedShare === null ? '—' : `${num(data.saturatedShare * 100, 1)} % des mesures (${data.samples7d})` }}</dd></div>
        </dl>
        <p class="m-0 text-[13px] leading-5 st-muted">Une vitesse d’analyse de 1 veut dire qu’un live de 4 heures demande 4 heures de calcul ; en dessous de 1, c’est plus long que le live lui-même.</p>
      </div>
    </template>

    <p v-else class="m-0 text-sm st-muted" role="status">Chargement…</p>
  </section>
</template>
