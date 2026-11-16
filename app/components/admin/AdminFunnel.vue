<script setup lang="ts">
// « Entonnoir » : où les streamers s'arrêtent, de la demande d'accès au paiement. Comptes exacts calculés depuis la base (aucun consentement
// nécessaire : rien de personnel n'est affiché). Le comportement des visiteurs avant la connexion est dans PostHog (seulement s'ils ont accepté).
interface Step { id: string, label: string, hint: string, count: number, rateFromParent: number | null, parent: string | null, medianDays: number | null }
interface Week { weekStart: string, counts: Record<string, number> }

const data = ref<{ steps: Step[], weeks: Week[], generatedAt: string } | null>(null)
const failed = ref('')
const loading = ref(false)
const picked = ref('connected')

async function load() {
  loading.value = true
  failed.value = ''
  try {
    data.value = await $fetch('/api/admin/funnel')
  } catch (e: any) {
    failed.value = e?.data?.statusMessage || e?.statusMessage || 'Impossible de charger l’entonnoir'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const top = computed(() => Math.max(1, ...(data.value?.steps.map(s => s.count) ?? [1])))
const labelOf = (id: string | null) => data.value?.steps.find(s => s.id === id)?.label ?? ''
const series = computed(() => data.value?.weeks.map(w => ({ week: w.weekStart, n: w.counts[picked.value] ?? 0 })) ?? [])
const seriesMax = computed(() => Math.max(1, ...series.value.map(p => p.n)))
const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const days = (n: number | null) => (n === null ? '—' : n < 1 ? `${Math.round(n * 24)} h` : `${String(n).replace('.', ',')} j`)

// Où ça coince le plus : l'étape suivante avec le taux le plus bas (parmi celles qui ont au moins un point de départ).
const worst = computed(() => {
  const candidates = (data.value?.steps ?? []).filter(s => s.rateFromParent !== null && s.parent && (data.value!.steps.find(p => p.id === s.parent)?.count ?? 0) >= 3)
  return candidates.sort((a, b) => a.rateFromParent! - b.rateFromParent!)[0] ?? null
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <p class="m-0 text-sm leading-relaxed st-muted">
      Combien de streamers atteignent chaque étape, calculé depuis la base (chiffres exacts, chaînes de démo et de test exclues, rien de personnel affiché).
      Un taux se lit « sur 100 qui étaient à l’étape de départ, combien arrivent ici ». Avant la connexion Twitch, les visiteurs sont suivis dans PostHog, seulement s’ils acceptent les cookies.
    </p>
    <p v-if="failed" class="st-alert st-alert-error m-0" role="alert">{{ failed }}</p>

    <section v-if="data" class="st-card flex flex-col gap-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="m-0 text-[17px] font-bold">Parcours</h2>
        <button type="button" class="st-btn-quiet" :disabled="loading" @click="load">Actualiser</button>
      </div>
      <p v-if="worst" class="st-alert st-alert-ok m-0" role="status">
        Le plus gros point de sortie pour l’instant : « {{ labelOf(worst.parent) }} » vers « {{ worst.label }} », seulement {{ worst.rateFromParent }} % passent.
      </p>
      <ol class="m-0 flex list-none flex-col gap-3 p-0">
        <li v-for="s in data.steps" :key="s.id" class="flex flex-col gap-1.5">
          <div class="flex flex-wrap items-baseline justify-between gap-x-3">
            <span class="font-bold">{{ s.label }}</span>
            <span class="text-[13px] st-muted">
              <strong class="st-title text-lg" style="color: inherit">{{ s.count }}</strong>
              <template v-if="s.rateFromParent !== null"> · {{ s.rateFromParent }} % de « {{ labelOf(s.parent) }} »</template>
              <template v-if="s.medianDays !== null"> · délai médian {{ days(s.medianDays) }}</template>
            </span>
          </div>
          <div class="h-2.5 overflow-hidden rounded-full bg-st-border" role="img" :aria-label="`${s.label} : ${s.count}`">
            <div class="h-full rounded-full bg-st-accent" :style="{ width: `${Math.max(2, Math.round((s.count / top) * 100))}%` }" />
          </div>
          <span class="text-xs st-muted">{{ s.hint }}</span>
        </li>
      </ol>
    </section>

    <section v-if="data" class="st-card flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="m-0 text-[17px] font-bold">Par semaine</h2>
        <label class="flex items-center gap-2 text-sm">
          <span class="st-muted">Étape</span>
          <select v-model="picked" class="st-field w-auto">
            <option v-for="s in data.steps" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </label>
      </div>
      <div class="flex h-36 items-end gap-1.5" role="img" :aria-label="`Courbe par semaine : ${labelOf(picked)}`">
        <div v-for="p in series" :key="p.week" class="flex h-full flex-1 flex-col items-center justify-end gap-1" :title="`Semaine du ${day(p.week)} : ${p.n}`">
          <span class="text-[11px] st-muted">{{ p.n || '' }}</span>
          <div class="w-full rounded-t bg-st-accent" :style="{ height: `${p.n ? Math.max(4, Math.round((p.n / seriesMax) * 100)) : 0}%`, minHeight: p.n ? '4px' : '0' }" />
        </div>
      </div>
      <div class="flex gap-1.5 text-[10px] st-muted">
        <span v-for="p in series" :key="p.week" class="flex-1 text-center">{{ day(p.week) }}</span>
      </div>
      <p class="m-0 text-xs st-muted">Chaque barre = la semaine (lundi à dimanche) où l’étape a été atteinte.</p>
    </section>
  </div>
</template>
