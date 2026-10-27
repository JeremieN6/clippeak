<script setup lang="ts">
// Tableau de bord de contenu : prochaine action, compteurs par statut, filtres et tri, clips regroupes par lot.
const studio = useStudio()

type Group = 'all' | 'review' | 'approved' | 'rejected' | 'progress' | 'failed'
const filters = reactive({ status: 'all' as Group, lot: 'all', note: 'all', date: 'all', cat: 'all', origin: 'all', sort: 'score' })
const openLots = reactive<Record<string, boolean>>({})

const groupOf = (status: string): Group => status === 'queued' || status === 'rendering' ? 'progress' : (status as Group)
const clips = computed(() => studio.clips.value)
const count = (g: Group) => clips.value.filter(c => groupOf(c.status) === g).length
const weekAgo = () => Date.now() - 7 * 24 * 3600 * 1000

const counters = computed(() => ([
  { key: 'review', label: 'À valider', fg: '#D6C7FF' },
  { key: 'approved', label: 'Approuvés', fg: '#6EDDB8' },
  { key: 'rejected', label: 'Refusés', fg: '#C9C3D6' },
  { key: 'progress', label: 'En préparation', fg: '#8DB9FF' },
  { key: 'failed', label: 'En échec', fg: '#FF9B8D' }
] as const).map(c => ({ ...c, n: count(c.key), selected: filters.status === c.key })))

const lotOptions = computed(() => [...new Set(clips.value.map(c => c.batch ?? 0))].sort((a, b) => b - a))
const categories = computed(() => [...new Set(clips.value.map(c => c.category).filter((c): c is string => !!c))].sort())

const passes = (c: StudioClip) => {
  if (filters.status !== 'all' && groupOf(c.status) !== filters.status) return false
  if (filters.lot !== 'all' && String(c.batch ?? 0) !== filters.lot) return false
  if (filters.note !== 'all' && (c.score ?? 0) < Number(filters.note)) return false
  if (filters.date === 'week' && new Date(c.createdAt).getTime() < weekAgo()) return false
  if (filters.cat !== 'all' && c.category !== filters.cat) return false
  if (filters.origin !== 'all' && c.origin !== filters.origin) return false
  return true
}

const filtered = computed(() => (['status', 'lot', 'note', 'date', 'cat', 'origin'] as const).some(k => filters[k] !== 'all'))
function clearFilters() {
  Object.assign(filters, { status: 'all', lot: 'all', note: 'all', date: 'all', cat: 'all', origin: 'all' })
}

const lots = computed(() => lotOptions.value.map((n) => {
  const all = clips.value.filter(c => (c.batch ?? 0) === n)
  let list = all.filter(passes)
  list = filters.sort === 'score'
    ? [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    : [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  // « Prêts » : à valider et sans point bloquant.
  const ready = all.filter(c => c.status === 'review' && !(c.qc?.issues ?? []).some(i => i.severity === 'error'))
  const open = openLots[String(n)] ?? (n === lotOptions.value[0])
  return { n, all, list, ready, open: open || filters.status !== 'all' || filters.lot !== 'all' }
}).filter(l => l.list.length))

const toggleLot = (n: number, open: boolean) => { openLots[String(n)] = !open }

const reviewCount = computed(() => count('review'))
const approvedCount = computed(() => count('approved'))
const next = computed(() => reviewCount.value > 0
  ? { title: `Valide les clips du lot ${lotOptions.value.find(n => clips.value.some(c => (c.batch ?? 0) === n && c.status === 'review')) ?? ''}`, text: `${reviewCount.value} clip(s) prêt(s) à valider${approvedCount.value ? `, ${approvedCount.value} approuvé(s) à télécharger.` : '.'}`, cta: 'Voir les clips à valider', status: 'review' as Group }
  : approvedCount.value > 0
    ? { title: 'Télécharge tes clips approuvés', text: `${approvedCount.value} clip(s) approuvé(s). Rien n’est publié sans toi.`, cta: 'Voir les clips approuvés', status: 'approved' as Group }
    : { title: 'Tout est à jour', text: 'Clippeak te prévient dès qu’un nouveau lot est prêt.', cta: '', status: 'all' as Group })

const settingsNav = computed(() => STEPS.filter(s => s.n < 8).map((s) => {
  const st = studio.stepStatus(s.n)
  return { ...s, ...st }
}))
const dot = { ok: 'bg-[#12302A] text-[#6EDDB8]', warn: 'bg-[#33280F] text-[#F6C260]', skip: 'bg-[#25212F] text-[#C9C3D6]', todo: 'bg-[#25212F] text-[#C9C3D6]' } as const
const dotIcon = { ok: '✓', warn: '!', skip: '–', todo: '–' } as const

const selectClass = 'st-field !min-h-11 !w-auto min-w-[140px]'
</script>

<template>
  <div class="flex flex-wrap items-stretch">
    <nav aria-label="Mes réglages" class="flex w-full flex-none flex-col gap-6 border-[#2C2837] p-4 lg:w-[280px] lg:border-r lg:py-6">
      <div class="flex flex-col gap-0.5">
        <button type="button" class="st-nav-item !min-h-12 text-[15px] font-bold" aria-current="page">Tableau de bord</button>
      </div>
      <div class="flex flex-col gap-0.5">
        <div class="px-3 pb-2 text-xs font-extrabold uppercase tracking-widest text-[#928BA2]">Mes réglages</div>
        <button v-for="s in settingsNav" :key="s.n" type="button" class="st-nav-item !min-h-11 text-sm font-semibold text-[#C9C3D6]" @click="studio.goToStep(s.n)">
          <span class="flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-black" :class="dot[s.status]">{{ dotIcon[s.status] }}</span>
          <span class="min-w-0 flex-1">{{ s.label }}</span>
          <span v-if="s.status === 'warn' || s.status === 'skip'" class="text-xs font-bold" :class="s.status === 'warn' ? 'text-[#F6C260]' : 'text-[#C9C3D6]'">{{ s.status === 'warn' ? 'À revoir' : 'Passée' }}</span>
        </button>
      </div>
      <div class="mt-auto flex items-center gap-2 px-2 text-[13px] leading-[18px] st-muted"><span class="h-2 w-2 flex-none rounded-full bg-[#6EDDB8]" />Clippeak surveille ton prochain live</div>
    </nav>

    <main class="flex min-w-0 flex-[999_1_620px] flex-col gap-7 px-5 py-8 sm:px-10">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="st-title m-0 text-[28px] font-bold leading-tight sm:text-[32px]">Tableau de bord</h1>
        <button type="button" class="st-btn-ghost" :disabled="studio.busy.value" @click="studio.run(studio.loadClips)">Actualiser</button>
      </div>

      <section class="flex flex-col justify-between gap-3.5 rounded-2xl border border-[#4B3A86] bg-[#1E1833] p-6">
        <div class="flex flex-col gap-1.5">
          <div class="st-eyebrow">Prochaine action</div>
          <h2 class="st-title m-0 text-[22px] font-bold leading-7">{{ next.title }}</h2>
          <div class="text-sm leading-relaxed text-[#C9BBF2]">{{ next.text }}</div>
        </div>
        <div v-if="next.cta"><button type="button" class="st-btn" @click="filters.status = next.status">{{ next.cta }}</button></div>
      </section>

      <div role="group" aria-label="Filtrer par statut" class="grid grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))] gap-3">
        <button v-for="c in counters" :key="c.key" type="button" :aria-pressed="c.selected" class="flex min-h-[84px] flex-col gap-1 rounded-[14px] p-4 text-left text-[#F3F1F7]" :class="c.selected ? 'border-[1.5px] border-[#B9A0FF] bg-[#2A1F4A]' : 'border border-[#2C2837] bg-[#16141C] hover:bg-[#1D1A25]'" @click="filters.status = c.selected ? 'all' : c.key">
          <span class="st-title text-3xl font-bold leading-9">{{ c.n }}</span>
          <span class="text-sm font-bold" :style="{ color: c.fg }">{{ c.label }}</span>
        </button>
      </div>

      <section aria-label="Filtres et tri" class="flex flex-col gap-3.5">
        <div class="flex flex-wrap items-end gap-x-3.5 gap-y-3">
          <div class="flex flex-col gap-1.5"><label for="f-lot" class="text-xs font-bold text-[#928BA2]">Lot</label>
            <select id="f-lot" v-model="filters.lot" :class="selectClass"><option value="all">Tous les lots</option><option v-for="n in lotOptions" :key="n" :value="String(n)">Lot {{ n || '-' }}</option></select></div>
          <div class="flex flex-col gap-1.5"><label for="f-note" class="text-xs font-bold text-[#928BA2]">Note</label>
            <select id="f-note" v-model="filters.note" :class="selectClass"><option value="all">Toutes les notes</option><option value="8">8 et plus</option><option value="7">7 et plus</option><option value="6">6 et plus</option></select></div>
          <div class="flex flex-col gap-1.5"><label for="f-date" class="text-xs font-bold text-[#928BA2]">Date</label>
            <select id="f-date" v-model="filters.date" :class="selectClass"><option value="all">Toutes les dates</option><option value="week">Cette semaine</option></select></div>
          <div class="flex flex-col gap-1.5"><label for="f-cat" class="text-xs font-bold text-[#928BA2]">Catégorie</label>
            <select id="f-cat" v-model="filters.cat" :class="selectClass"><option value="all">Toutes</option><option v-for="c in categories" :key="c" :value="c">{{ c }}</option></select></div>
          <div class="flex flex-col gap-1.5"><label for="f-origin" class="text-xs font-bold text-[#928BA2]">Origine du moment</label>
            <select id="f-origin" v-model="filters.origin" :class="selectClass"><option value="all">Toutes</option><option value="chat">Détecté par le chat</option><option value="ref">Ressemble à un de tes clips</option></select></div>
          <div class="ml-auto flex flex-col gap-1.5"><label for="f-sort" class="text-xs font-bold text-[#928BA2]">Trier par</label>
            <select id="f-sort" v-model="filters.sort" :class="selectClass"><option value="score">Meilleure note d’abord</option><option value="recent">Plus récent d’abord</option></select></div>
        </div>
        <div v-if="filtered"><button type="button" class="st-btn-quiet text-sm" @click="clearFilters">Effacer les filtres</button></div>
      </section>

      <section v-for="lot in lots" :key="lot.n" class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
          <div class="flex flex-col gap-0.5"><h2 class="st-title m-0 text-[22px] font-bold leading-7">Lot {{ lot.n || '-' }}</h2><div class="text-[13px] st-muted">{{ lot.all.length }} clip(s)</div></div>
          <div class="flex flex-wrap items-center gap-2">
            <button v-if="lot.ready.length" type="button" class="st-btn-ghost text-sm" :disabled="studio.busy.value" @click="studio.approveMany(lot.ready)">Approuver les clips prêts ({{ lot.ready.length }})</button>
            <button type="button" class="st-btn-quiet text-sm" :aria-expanded="lot.open" @click="toggleLot(lot.n, lot.open)">{{ lot.open ? 'Replier' : `Voir les ${lot.all.length} clips` }}</button>
          </div>
        </div>
        <div v-if="lot.open" class="grid grid-cols-[repeat(auto-fit,minmax(min(560px,100%),1fr))] items-start gap-4">
          <StudioClipCard v-for="c in lot.list" :key="c.id + c.status" :clip="c" />
        </div>
      </section>

      <div v-if="!clips.length" class="st-card flex flex-col items-center gap-2.5 !py-8 text-center">
        <h2 class="st-title m-0 text-xl font-bold">Tes premiers clips arriveront après ton prochain live</h2>
        <p class="m-0 max-w-sm text-sm leading-relaxed st-muted">Clippeak surveille ton live et prépare les clips par lots de 4. Ils apparaîtront ici dès qu’ils sont prêts.</p>
      </div>
      <div v-else-if="!lots.length" class="st-card flex flex-col items-center gap-2.5 !py-8 text-center">
        <h2 class="st-title m-0 text-lg font-bold">Aucun clip ne correspond</h2>
        <p class="m-0 text-sm st-muted">Change ou efface les filtres pour revoir tes clips.</p>
        <button type="button" class="st-btn-ghost" @click="clearFilters">Effacer les filtres</button>
      </div>
    </main>
  </div>
</template>
