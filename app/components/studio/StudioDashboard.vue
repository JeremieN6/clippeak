<script setup lang="ts">
// Tableau de bord de contenu : prochaine action, compteurs par statut, filtres et tri, clips regroupes par lot.
const studio = useStudio()

type Group = 'all' | 'review' | 'approved' | 'published' | 'rejected' | 'progress' | 'failed'
const filters = reactive({ status: 'all' as Group, lot: 'all', note: 'all', date: 'all', cat: 'all', origin: 'all', sort: 'score' })
const openLots = reactive<Record<string, boolean>>({})

// Un clip est dans UN seul groupe : « Publiés » (au moins une publication partie) passe avant « Approuvés » (pas encore publie).
const groupOf = (c: StudioClip): Group => isPublished(c) ? 'published' : c.status === 'queued' || c.status === 'rendering' ? 'progress' : (c.status as Group)
const clips = computed(() => studio.clips.value)
const count = (g: Group) => clips.value.filter(c => groupOf(c) === g).length
const weekAgo = () => Date.now() - 7 * 24 * 3600 * 1000

const counters = computed(() => ([
  { key: 'review', label: 'À valider', fg: 'var(--st-accent-text)' },
  { key: 'approved', label: 'Approuvés', fg: 'var(--st-ok)' },
  { key: 'published', label: 'Publiés', fg: 'var(--st-ok)' },
  { key: 'rejected', label: 'Refusés', fg: 'var(--st-soft)' },
  { key: 'progress', label: 'En préparation', fg: 'var(--st-info)' },
  { key: 'failed', label: 'En échec', fg: 'var(--st-error)' }
] as const).map(c => ({ ...c, n: count(c.key), selected: filters.status === c.key })))

const lotOptions = computed(() => [...new Set(clips.value.map(c => c.batch ?? 0))].sort((a, b) => b - a))
const categories = computed(() => [...new Set(clips.value.map(c => c.category).filter((c): c is string => !!c))].sort())

const passes = (c: StudioClip) => {
  if (filters.status !== 'all' && groupOf(c) !== filters.status) return false
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

const pubSummary = computed(() => {
  const all = clips.value.flatMap(c => c.publications)
  const scheduled = all.filter(p => p.status === 'scheduled').length
  const published = all.filter(p => p.status === 'published').length
  return [scheduled ? `${scheduled} programmé(s)` : '', published ? `${published} publié(s)` : ''].filter(Boolean).join(' · ')
})

// Analyse / rendu en cours : part des clips des lots concernes qui sont deja sortis du rendu.
const progress = computed(() => {
  const running = clips.value.filter(c => groupOf(c) === 'progress')
  if (!running.length) return null
  const batches = new Set(running.map(c => c.batch ?? 0))
  const total = clips.value.filter(c => batches.has(c.batch ?? 0)).length
  // Estimation grossiere : ~40 s par clip (rendu + controle) ; on arrondit a la minute, jamais moins d'une minute.
  return { running: running.length, minutes: Math.max(1, Math.ceil(running.length * 40 / 60)), pct: Math.max(8, Math.round(((total - running.length) / total) * 100)) }
})

// Plateforme a reconnecter : un envoi a echoue parce que l'acces a expire, sans envoi reussi ou programme apres lui.
const platformNames: Record<string, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' }
const disconnected = computed(() => {
  const all = clips.value.flatMap(c => c.publications)
  const platforms = [...new Set(all.filter(p => p.status === 'failed' && /reconnecte/i.test(p.error ?? '')).map(p => p.platform))]
  return platforms.filter((pl) => {
    const failedAt = Math.max(...all.filter(p => p.platform === pl && p.status === 'failed').map(p => new Date(p.scheduledAt).getTime()))
    return !all.some(p => p.platform === pl && ['published', 'scheduled', 'publishing'].includes(p.status) && new Date(p.scheduledAt).getTime() > failedAt)
  }).map(pl => ({ id: pl, name: platformNames[pl] ?? pl }))
})

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
const dot = { ok: 'bg-st-okBg text-st-ok', warn: 'bg-st-warnBg text-st-warn', skip: 'bg-st-raised2 text-st-soft', todo: 'bg-st-raised2 text-st-soft' } as const

const navOpen = ref(false)
// Colonne de gauche repliable sur grand ecran ; le choix est garde dans le navigateur (facultatif).
const collapsed = ref(false)
onMounted(() => { try { collapsed.value = localStorage.getItem('clippeak.nav') === '0' } catch {} })
watch(collapsed, (v) => { try { localStorage.setItem('clippeak.nav', v ? '0' : '1') } catch {} })
const selectClass = 'st-field !min-h-11 !w-full'
</script>

<template>
  <div class="flex flex-wrap items-stretch">
    <nav aria-label="Mes réglages" class="flex w-full flex-none flex-col gap-6 border-st-border p-4 lg:w-[280px] lg:border-r lg:py-6" :class="collapsed ? 'lg:!hidden' : ''">
      <div class="hidden flex-col gap-0.5 lg:flex">
        <button type="button" class="st-nav-item !min-h-12 text-[15px] font-bold" aria-current="page">Tableau de bord</button>
      </div>
      <button type="button" class="st-btn-ghost w-full lg:hidden" :aria-expanded="navOpen" aria-controls="st-settings" @click="navOpen = !navOpen">{{ navOpen ? 'Masquer mes réglages' : 'Mes réglages' }}</button>
      <div id="st-settings" class="flex-col gap-0.5 lg:flex" :class="navOpen ? 'flex' : 'hidden'">
        <div class="px-3 pb-2 text-xs font-extrabold uppercase tracking-widest text-st-dim">Mes réglages</div>
        <button v-for="s in settingsNav" :key="s.n" type="button" class="st-nav-item !min-h-11 text-sm font-semibold text-st-soft" @click="studio.goToStep(s.n)">
          <span class="flex h-5 w-5 flex-none items-center justify-center rounded-full" :class="dot[s.status]" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path v-if="s.status === 'ok'" d="M5 12.5l4.5 4.5L19 7.5" /><path v-else-if="s.status === 'warn'" d="M12 6v8M12 18h.01" /><path v-else d="M6 12h12" /></svg>
          </span>
          <span class="sr-only">{{ ({ ok: 'Terminée', warn: 'À revoir', skip: 'Passée', todo: 'À faire' } as const)[s.status] }}.</span>
          <span class="min-w-0 flex-1">{{ s.label }}</span>
          <span v-if="s.status === 'warn' || s.status === 'skip'" class="text-xs font-bold" :class="s.status === 'warn' ? 'text-st-warn' : 'text-st-soft'">{{ s.status === 'warn' ? 'À revoir' : 'Passée' }}</span>
        </button>
      </div>
      <div class="mt-auto hidden items-center gap-2 lg:flex px-2 text-[13px] leading-[18px] st-muted"><span class="h-2 w-2 flex-none rounded-full bg-st-ok" />Clippeak surveille ton prochain live</div>
    </nav>

    <main class="flex min-w-0 flex-[999_1_620px] flex-col gap-7 px-5 py-8 sm:px-10">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <button type="button" class="hidden h-11 w-11 items-center justify-center rounded-[10px] border border-st-border bg-st-surface text-st-soft hover:bg-st-raised lg:flex" :aria-label="collapsed ? 'Afficher mes réglages' : 'Masquer mes réglages'" :aria-pressed="collapsed" @click="collapsed = !collapsed">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></svg>
          </button>
          <h1 class="st-title m-0 text-[28px] font-bold leading-tight sm:text-[32px]">Tableau de bord</h1>
        </div>
        <button type="button" class="st-btn-ghost" :disabled="studio.busy.value" @click="studio.run(studio.loadClips)">Actualiser</button>
      </div>

      <StudioVodAlerts />

      <p v-if="pubSummary" class="st-pop m-0 -mt-4 text-sm font-semibold text-st-ok">{{ pubSummary }}</p>

      <div v-if="progress" class="st-alert st-alert-info st-rise flex-col !gap-2.5" role="status">
        <div class="flex items-center gap-2 font-bold">
          <svg class="flex-none" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" opacity=".3" /><path d="M12 3a9 9 0 0 1 9 9" /></svg>
          Clippeak prépare {{ progress.running }} clip{{ progress.running > 1 ? 's' : '' }}
        </div>
        <p class="m-0 text-[13px] opacity-90">Il cherche et monte les meilleurs moments. Compte environ {{ progress.minutes }} min. Les clips arrivent ici dès qu’ils sont prêts, tu peux fermer la page.</p>
        <div class="h-1.5 w-full overflow-hidden rounded-[3px] bg-st-border" role="progressbar" aria-label="Préparation des clips" :aria-valuenow="progress.pct" aria-valuemin="0" aria-valuemax="100"><div class="st-bar st-bar-live" :style="{ width: `${progress.pct}%` }" /></div>
      </div>

      <div v-for="p in disconnected" :key="p.id" class="st-alert st-alert-warn st-rise flex-wrap items-center" role="alert">
        <div class="min-w-[220px] flex-1">
          <div class="font-bold">{{ p.name }} est déconnecté</div>
          <div class="text-[13px] opacity-90">Une publication n’est pas partie : l’accès à ton compte a expiré. Tes clips sont gardés, rien n’est perdu.</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <a :href="`/api/auth/${p.id}`" class="st-btn no-underline">Reconnecter</a>
          <button type="button" class="st-btn-ghost" @click="filters.status = 'approved'">Télécharger les clips</button>
        </div>
      </div>

      <section class="flex flex-col justify-between gap-3.5 rounded-2xl border border-st-accentBorder bg-st-accentDeep p-6">
        <div class="flex flex-col gap-1.5">
          <div class="st-eyebrow">Prochaine action</div>
          <h2 class="st-title m-0 text-[22px] font-bold leading-7">{{ next.title }}</h2>
          <div class="text-sm leading-relaxed text-st-accentSoft">{{ next.text }}</div>
        </div>
        <div v-if="next.cta"><button type="button" class="st-btn" @click="filters.status = next.status">{{ next.cta }}</button></div>
      </section>

      <div role="group" aria-label="Filtrer par statut" class="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))]">
        <button v-for="c in counters" :key="c.key" type="button" :aria-pressed="c.selected" class="flex min-h-[72px] flex-col gap-1 rounded-[14px] p-3.5 sm:min-h-[84px] sm:p-4 text-left text-st-text" :class="c.selected ? 'border-[1.5px] border-st-accentLight bg-st-accentBg' : 'border border-st-border bg-st-surface hover:bg-st-raised'" @click="filters.status = c.selected ? 'all' : c.key">
          <span class="st-title text-3xl font-bold leading-9">{{ c.n }}</span>
          <span class="text-sm font-bold" :style="{ color: c.fg }">{{ c.label }}</span>
        </button>
      </div>

      <section aria-label="Filtres et tri" class="flex flex-col gap-3.5">
        <div class="grid grid-cols-2 items-end gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <div class="flex flex-col gap-1.5"><label for="f-lot" class="text-xs font-bold text-st-dim">Lot</label>
            <select id="f-lot" v-model="filters.lot" :class="selectClass"><option value="all">Tous les lots</option><option v-for="n in lotOptions" :key="n" :value="String(n)">Lot {{ n || '-' }}</option></select></div>
          <div class="flex flex-col gap-1.5"><label for="f-note" class="text-xs font-bold text-st-dim">Note</label>
            <select id="f-note" v-model="filters.note" :class="selectClass"><option value="all">Toutes les notes</option><option value="8">8 et plus</option><option value="7">7 et plus</option><option value="6">6 et plus</option></select></div>
          <div class="flex flex-col gap-1.5"><label for="f-date" class="text-xs font-bold text-st-dim">Date</label>
            <select id="f-date" v-model="filters.date" :class="selectClass"><option value="all">Toutes les dates</option><option value="week">Cette semaine</option></select></div>
          <div class="flex flex-col gap-1.5"><label for="f-cat" class="text-xs font-bold text-st-dim">Catégorie</label>
            <select id="f-cat" v-model="filters.cat" :class="selectClass"><option value="all">Toutes</option><option v-for="c in categories" :key="c" :value="c">{{ c }}</option></select></div>
          <div class="flex flex-col gap-1.5"><label for="f-origin" class="text-xs font-bold text-st-dim">Origine du moment</label>
            <select id="f-origin" v-model="filters.origin" :class="selectClass"><option value="all">Toutes</option><option value="chat">Détecté par le chat</option><option value="ref">Ressemble à un de tes clips</option></select></div>
          <div class="col-span-2 flex flex-col gap-1.5 sm:col-span-1"><label for="f-sort" class="text-xs font-bold text-st-dim">Trier par</label>
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

      <div v-if="!clips.length" class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-st-borderStrong px-6 py-12 text-center">
        <span class="flex h-14 w-14 items-center justify-center rounded-full bg-st-accentBg text-st-accentLight" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9.5v5l4.5-2.5z" /></svg>
        </span>
        <h2 class="st-title m-0 text-xl font-bold">Tes premiers clips arriveront après ton prochain live</h2>
        <p class="m-0 max-w-sm text-sm leading-relaxed st-muted">Clippeak surveille ton live et prépare les clips par lots de 4. Ils apparaîtront ici dès qu’ils sont prêts.</p>
        <button type="button" class="st-btn-ghost" @click="studio.goToStep(1)">Revoir mes clips de référence</button>
      </div>
      <div v-else-if="!lots.length" class="st-card flex flex-col items-center gap-2.5 !py-8 text-center">
        <h2 class="st-title m-0 text-lg font-bold">Aucun clip ne correspond</h2>
        <p class="m-0 text-sm st-muted">Change ou efface les filtres pour revoir tes clips.</p>
        <button type="button" class="st-btn-ghost" @click="clearFilters">Effacer les filtres</button>
      </div>
    </main>
  </div>
</template>
