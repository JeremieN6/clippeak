<script setup lang="ts">
// Tableau de bord de contenu : prochaine action, compteurs par statut, filtres et tri, clips regroupes par lot.
const studio = useStudio()

type Group = 'all' | 'review' | 'approved' | 'published' | 'rejected' | 'progress' | 'failed'
const filters = reactive({ status: 'all' as Group, lot: 'all', note: 'all', date: 'all', cat: 'all', origin: 'all', sort: 'score' })
const openLots = reactive<Record<string, boolean>>({})

// Un clip est dans UN seul groupe : « Publiés » (au moins une publication partie) passe avant « Approuvés » (pas encore publie).
const groupOf = (c: StudioClip): Group => isPublished(c) ? 'published' : c.status === 'queued' || c.status === 'rendering' ? 'progress' : (c.status as Group)
// Les extraits longs (16:9) ont leur propre page « Extraits longs » : ils ne se melangent pas aux lots de clips verticaux.
const clips = computed(() => studio.clips.value.filter(c => c.format !== 'long'))
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

// Filtres du panneau « Filtres » (note, date, categorie, origine) : leur nombre s'affiche sur le bouton.
const filtersOpen = ref(false)
const panelFilterCount = computed(() => (['note', 'date', 'cat', 'origin'] as const).filter(k => filters[k] !== 'all').length)
const filtered = computed(() => (['status', 'lot', 'note', 'date', 'cat', 'origin'] as const).some(k => filters[k] !== 'all'))
function clearFilters() {
  Object.assign(filters, { status: 'all', lot: 'all', note: 'all', date: 'all', cat: 'all', origin: 'all' })
}

const lots = computed(() => lotOptions.value.map((n) => {
  const all = clips.value.filter(c => (c.batch ?? 0) === n)
  let list = all.filter(passes)
  // « Ordre du lot » : l'ordre dans lequel les clips ont ete prepares.
  list = filters.sort === 'score'
    ? [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    : [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  // « Prêts » : à valider et sans point bloquant.
  const ready = all.filter(c => c.status === 'review' && !(c.qc?.issues ?? []).some(i => i.severity === 'error'))
  const open = openLots[String(n)] ?? (n === lotOptions.value[0])
  return { n, all, list, ready, approved: approvedToPublish(n), open: open || filters.status !== 'all' || filters.lot !== 'all' }
}).filter(l => l.list.length))

const toggleLot = (n: number, open: boolean) => { openLots[String(n)] = !open }

// Panneau « Detail du clip » (un clip a la fois) et publication groupee d'un lot.
const drawerId = ref<string | null>(null)
const drawerClip = computed(() => clips.value.find(c => c.id === drawerId.value) ?? null)
watch(drawerClip, (c) => { if (drawerId.value && !c) drawerId.value = null })
const bulkLot = ref<number | null>(null)
const bulkClips = computed(() => bulkLot.value === null ? [] : approvedToPublish(bulkLot.value))
// Clips approuves d'un lot, pas encore publies ni en cours d'envoi : ceux que « Publier les approuves… » peut envoyer (hors TikTok, clip par clip).
const approvedToPublish = (n: number) => clips.value.filter(c => (c.batch ?? 0) === n && c.status === 'approved' && !!c.videoUrl && !c.publications.some(p => ['published', 'publishing', 'scheduled'].includes(p.status)))
watch(bulkClips, (list) => { if (bulkLot.value !== null && !list.length) bulkLot.value = null })

// Les deux lots les plus recents sont montres ; « Voir les lots precedents » montre les autres. Un filtre actif montre tous les lots concernes.
const showOlder = ref(false)
const visibleLots = computed(() => showOlder.value || filtered.value ? lots.value : lots.value.slice(0, 2))
const hiddenLots = computed(() => lots.value.length - visibleLots.value.length)

// « Mis a jour il y a … » : se rafraichit toutes les 30 secondes.
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 30_000) })
onBeforeUnmount(() => { if (clock) clearInterval(clock) })
const updatedText = computed(() => {
  const at = studio.clipsLoadedAt.value
  if (!at) return ''
  const minutes = Math.floor((now.value - at) / 60_000)
  if (minutes < 1) return 'Mis à jour à l’instant'
  if (minutes < 60) return `Mis à jour il y a ${minutes} minute${minutes > 1 ? 's' : ''}`
  const hours = Math.floor(minutes / 60)
  return `Mis à jour il y a ${hours} heure${hours > 1 ? 's' : ''}`
})

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

// « Offre Creator · renouvelée le 30 novembre » (ou « Offre Starter » sans abonnement), sous le compteur de clips du menu.
const offerLine = computed(() => {
  const b = studio.billing.value
  if (!b?.available || !b.planName) return ''
  const renews = b.renewsAt ? new Date(b.renewsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : ''
  return b.plan === 'creator' ? `Offre ${b.planName}${renews ? ` · renouvelée le ${renews}` : ''}` : `Offre ${b.planName}`
})

const resetDate = computed(() => {
  if (!studio.quota.value) return ''
  const d = new Date(studio.quota.value.resetsAt)
  return `${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${d.toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' })}`
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
// Reglages a revoir ou a faire : affiches a cote de « Mes reglages » (et en pastille quand le menu est replie).
const todoCount = computed(() => settingsNav.value.filter(s => s.status === 'warn' || s.status === 'todo').length)
const dot = { ok: 'bg-st-okBg text-st-ok', warn: 'bg-st-warnBg text-st-warn', skip: 'bg-st-raised2 text-st-soft', todo: 'bg-st-raised2 text-st-soft' } as const

// Telephone (moins de 640 px) : la vue de la maquette « Tableau de bord, telephone » (onglets en bas, un clip a la fois).
const isPhone = ref(false)
let phoneQuery: MediaQueryList | null = null
const onPhone = (e: MediaQueryListEvent) => { isPhone.value = e.matches }
onMounted(() => { phoneQuery = window.matchMedia('(max-width: 639px)'); isPhone.value = phoneQuery.matches; phoneQuery.addEventListener('change', onPhone) })
onBeforeUnmount(() => { phoneQuery?.removeEventListener('change', onPhone) })

const navOpen = ref(false)
// Badge « Nouveau » sur « Extraits longs » jusqu'a la premiere visite de la page (choix garde dans le navigateur, facultatif).
const longSeen = ref(true)
onMounted(() => { try { longSeen.value = localStorage.getItem('clippeak.longSeen') === '1' } catch {} })
const openLong = () => { try { localStorage.setItem('clippeak.longSeen', '1') } catch {} longSeen.value = true; studio.view.value = 'long' }
// Colonne de gauche repliable sur grand ecran ; le choix est garde dans le navigateur (facultatif).
const collapsed = ref(false)
onMounted(() => { try { collapsed.value = localStorage.getItem('clippeak.nav') === '0' } catch {} })
watch(collapsed, (v) => { try { localStorage.setItem('clippeak.nav', v ? '0' : '1') } catch {} })
const selectClass = 'st-field !min-h-11 !w-full'
</script>

<template>
  <StudioDashboardMobile v-if="isPhone" />
  <div v-else class="flex flex-wrap items-stretch">
    <nav aria-label="Mes réglages" class="flex w-full flex-none flex-col gap-6 border-st-border p-4 lg:w-[280px] lg:border-r lg:py-6" :class="collapsed ? 'lg:!w-[76px] lg:items-center' : ''">
      <div class="hidden flex-col gap-0.5 lg:flex" :class="collapsed ? 'lg:items-center' : ''">
        <button type="button" class="st-nav-item !min-h-12 text-[15px] font-bold" :class="collapsed ? '!w-12 !justify-center !px-0' : ''" aria-current="page" aria-label="Tableau de bord">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="flex-none"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></svg>
          <span v-if="!collapsed">Tableau de bord</span>
        </button>
        <button type="button" class="st-nav-item relative !min-h-12 text-[15px] font-semibold" :class="collapsed ? '!w-12 !justify-center !px-0' : ''" :aria-label="longSeen ? 'Extraits longs' : 'Extraits longs, nouveau'" @click="openLong">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="flex-none"><path d="M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M16 9h4M4 15h4M16 15h4" /></svg>
          <span v-if="!collapsed" class="min-w-0 flex-1">Extraits longs</span>
          <span v-if="!longSeen && !collapsed" class="st-badge st-badge-violet">Nouveau</span>
          <span v-if="!longSeen && collapsed" class="absolute right-2.5 top-2 h-2 w-2 rounded-full bg-st-accentLight" aria-hidden="true" />
        </button>
      </div>
      <button type="button" class="st-btn-ghost w-full lg:hidden" :aria-expanded="navOpen" aria-controls="st-settings" @click="navOpen = !navOpen">{{ navOpen ? 'Masquer mes réglages' : 'Mes réglages' }}</button>
      <button v-if="collapsed" type="button" class="st-nav-item relative hidden !min-h-12 !w-12 !justify-center !px-0 lg:flex" :aria-label="todoCount ? `Mes réglages, ${todoCount} à revoir` : 'Mes réglages, tout est réglé'" @click="collapsed = false">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M8 15v4" /></svg>
        <span v-if="todoCount" class="absolute right-2.5 top-2 h-2 w-2 rounded-full bg-st-warn" aria-hidden="true" />
      </button>
      <div id="st-settings" class="flex-col gap-0.5 lg:flex" :class="[navOpen ? 'flex' : 'hidden', collapsed ? 'lg:!hidden' : '']">
        <div class="flex items-center justify-between gap-2 px-3 pb-2"><span class="text-xs font-extrabold uppercase tracking-widest text-st-dim">Mes réglages</span><span class="text-xs font-bold" :class="todoCount ? 'text-st-warn' : 'text-st-ok'">{{ todoCount ? `${todoCount} à revoir` : 'Tout est réglé' }}</span></div>
        <button v-for="s in settingsNav" :key="s.n" type="button" class="st-nav-item !min-h-11 text-sm font-semibold text-st-soft" @click="studio.goToStep(s.n)">
          <span class="flex h-5 w-5 flex-none items-center justify-center rounded-full" :class="dot[s.status]" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path v-if="s.status === 'ok'" d="M5 12.5l4.5 4.5L19 7.5" /><path v-else-if="s.status === 'warn'" d="M12 6v8M12 18h.01" /><path v-else d="M6 12h12" /></svg>
          </span>
          <span class="sr-only">{{ ({ ok: 'Terminée', warn: 'À revoir', skip: 'Passée', todo: 'À faire' } as const)[s.status] }}.</span>
          <span class="min-w-0 flex-1">{{ s.label }}</span>
          <span v-if="s.status === 'warn' || s.status === 'skip'" class="text-xs font-bold" :class="s.status === 'warn' ? 'text-st-warn' : 'text-st-soft'">{{ s.status === 'warn' ? 'À revoir' : 'Passée' }}</span>
        </button>
      </div>
      <div v-if="studio.quota.value && studio.quota.value.limit !== null" class="mt-auto hidden flex-col gap-2 rounded-xl border border-st-border bg-st-surface p-3.5 lg:flex" :class="collapsed ? 'lg:!hidden' : ''" aria-label="Clips utilisés ce mois-ci">
        <div class="text-xs font-extrabold uppercase tracking-widest text-st-dim">Clips ce mois-ci</div>
        <div class="flex items-baseline gap-1.5"><span class="st-title text-2xl font-bold leading-none">{{ studio.quota.value.used }}</span><span class="text-sm st-muted">/ {{ studio.quota.value.limit }}</span></div>
        <div class="h-1.5 overflow-hidden rounded-[3px] bg-st-raised2" role="progressbar" aria-label="Clips utilisés" aria-valuemin="0" :aria-valuemax="studio.quota.value.limit" :aria-valuenow="studio.quota.value.used"><div class="st-bar h-full" :style="{ width: `${Math.min(100, Math.round(studio.quota.value.used / Math.max(1, studio.quota.value.limit) * 100))}%` }" /></div>
        <div v-if="offerLine" class="text-[13px] leading-5 st-muted">{{ offerLine }}</div>
      </div>
      <div class="hidden items-center gap-2 lg:flex px-2 text-[13px] leading-[18px] st-muted" :class="[collapsed ? 'lg:!hidden' : '', studio.quota.value && studio.quota.value.limit !== null ? '' : 'mt-auto']"><span class="h-2 w-2 flex-none rounded-full bg-st-ok" />Clippeak surveille ton prochain live</div>
    </nav>

    <main class="flex min-w-0 flex-[999_1_620px] flex-col gap-7 px-5 py-8 sm:px-10">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <button type="button" class="hidden h-11 w-11 items-center justify-center rounded-[10px] border border-st-border bg-st-surface text-st-soft hover:bg-st-raised lg:flex" :aria-label="collapsed ? 'Déplier le menu' : 'Replier le menu'" :aria-pressed="collapsed" @click="collapsed = !collapsed">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></svg>
          </button>
          <div>
            <h1 class="st-title m-0 text-[28px] font-bold leading-tight sm:text-[32px]">Tableau de bord</h1>
            <div v-if="updatedText" class="mt-0.5 text-[13px] text-st-dim" aria-live="off">{{ updatedText }}</div>
          </div>
        </div>
        <button type="button" class="st-btn-ghost" :disabled="studio.busy.value" @click="studio.run(studio.loadClips)">Actualiser</button>
      </div>

      <StudioVodAlerts />

      <StudioAnalysisBanner />

      <div v-if="studio.connectFailure.value" class="st-alert st-alert-error st-rise flex-wrap items-center" role="alert">
        <div class="min-w-[220px] flex-1">
          <div class="font-bold">La connexion à {{ platformNames[studio.connectFailure.value] }} a échoué</div>
          <div class="text-[13px] opacity-90">{{ platformNames[studio.connectFailure.value] }} n’a pas accepté la connexion. Tant que {{ studio.connectFailure.value === 'youtube' ? 'Google' : 'TikTok' }} n’a pas validé Clippeak, ça peut arriver : ça peut prendre du temps. En attendant, télécharge tes clips et publie-les à la main.</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <a :href="`/api/auth/${studio.connectFailure.value}`" class="st-btn no-underline">Réessayer</a>
          <button type="button" class="st-btn-ghost" @click="filters.status = 'approved'; studio.connectFailure.value = null">Télécharger les clips</button>
          <button type="button" class="st-btn-quiet" @click="studio.connectFailure.value = null">Fermer</button>
        </div>
      </div>

      <p v-if="pubSummary" class="st-pop m-0 -mt-4 text-sm font-semibold text-st-ok">{{ pubSummary }}</p>

      <div v-if="studio.quota.value?.reached" class="st-alert st-alert-warn st-rise flex-wrap items-center" role="alert">
        <div class="min-w-[220px] flex-1">
          <div class="font-bold">Plafond du mois atteint ({{ studio.quota.value.used }} / {{ studio.quota.value.limit }} clips)</div>
          <div class="text-[13px] opacity-90">Les nouveaux clips reprennent le {{ resetDate }} : tes prochains lives attendent, rien n’est perdu. Tes clips actuels restent disponibles. Besoin de plus de place ? Écris à contact.clippeak@sassify.fr.</div>
        </div>
      </div>
      <p v-else-if="studio.quota.value && studio.quota.value.limit !== null" class="m-0 -mt-4 text-[13px] st-muted lg:hidden">Clips ce mois-ci : {{ studio.quota.value.used }} / {{ studio.quota.value.limit }}</p>

      <StudioBilling />

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
          <div class="font-bold">{{ p.name }} n’est plus connecté</div>
          <div class="text-[13px] opacity-90">Une publication n’est pas partie : l’accès à ton compte a expiré. Tes clips approuvés ne peuvent plus y être publiés, mais ils sont gardés : tu peux les télécharger en attendant.</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <a :href="`/api/auth/${p.id}`" class="st-btn no-underline">Reconnecter {{ p.name }}</a>
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

      <section aria-label="Filtres et tri" class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <select id="f-lot" v-model="filters.lot" aria-label="Lot" class="st-field !min-h-11 !w-auto"><option value="all">Tous les lots</option><option v-for="n in lotOptions" :key="n" :value="String(n)">Lot {{ n || '-' }}</option></select>
          <select id="f-sort" v-model="filters.sort" aria-label="Trier par" class="st-field !min-h-11 !w-auto"><option value="score">Meilleure note d’abord</option><option value="lot">Ordre du lot</option></select>
          <button type="button" class="st-btn-ghost" :aria-expanded="filtersOpen" aria-controls="st-filters-panel" :class="filtersOpen || panelFilterCount ? '!border-st-accentLight !bg-st-accentBg' : ''" @click="filtersOpen = !filtersOpen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M8 15v4" /></svg>
            Filtres<span v-if="panelFilterCount" class="st-badge st-badge-violet !min-h-5 !px-2">{{ panelFilterCount }}</span>
          </button>
          <button v-if="filtered" type="button" class="st-btn-quiet text-sm" @click="clearFilters">Effacer les filtres</button>
        </div>
        <div v-if="filtersOpen" id="st-filters-panel" class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 rounded-[14px] border border-st-border bg-st-surface p-4">
          <div class="flex flex-col gap-1.5"><label for="f-note" class="text-[13px] font-bold text-st-dim">Note</label>
            <select id="f-note" v-model="filters.note" :class="selectClass"><option value="all">Toutes les notes</option><option value="8">8 et plus</option><option value="7">7 et plus</option><option value="6">6 et plus</option></select></div>
          <div class="flex flex-col gap-1.5"><label for="f-date" class="text-[13px] font-bold text-st-dim">Date</label>
            <select id="f-date" v-model="filters.date" :class="selectClass"><option value="all">Toutes les dates</option><option value="week">Cette semaine</option></select></div>
          <div class="flex flex-col gap-1.5"><label for="f-cat" class="text-[13px] font-bold text-st-dim">Catégorie</label>
            <select id="f-cat" v-model="filters.cat" :class="selectClass"><option value="all">Toutes</option><option v-for="c in categories" :key="c" :value="c">{{ c }}</option></select></div>
          <div class="flex flex-col gap-1.5"><label for="f-origin" class="text-[13px] font-bold text-st-dim">Origine du moment</label>
            <select id="f-origin" v-model="filters.origin" :class="selectClass"><option value="all">Toutes</option><option value="chat">Détecté par le chat</option><option value="ref">Ressemble à un de tes clips</option></select></div>
        </div>
      </section>

      <section v-for="lot in visibleLots" :key="lot.n" class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
          <div class="flex flex-col gap-0.5"><h2 class="st-title m-0 text-[22px] font-bold leading-7">Lot {{ lot.n || '-' }}</h2><div class="text-[13px] st-muted">{{ lot.all.length }} clip(s)</div></div>
          <div class="flex flex-wrap items-center gap-2">
            <button v-if="lot.ready.length" type="button" class="st-btn-ghost text-sm" :disabled="studio.busy.value" @click="studio.approveMany(lot.ready)">Approuver les clips prêts ({{ lot.ready.length }})</button>
            <button v-if="lot.approved.length" type="button" class="st-btn text-sm" :disabled="studio.busy.value" @click="bulkLot = lot.n">Publier les approuvés…</button>
            <button type="button" class="st-btn-quiet text-sm" :aria-expanded="lot.open" @click="toggleLot(lot.n, lot.open)">{{ lot.open ? 'Replier' : `Voir les ${lot.all.length} clips` }}</button>
          </div>
        </div>
        <div v-if="lot.open" class="grid grid-cols-[repeat(auto-fill,minmax(min(480px,100%),1fr))] items-stretch gap-4">
          <StudioClipRow v-for="c in lot.list" :key="c.id" :clip="c" @open="drawerId = c.id" />
        </div>
      </section>

      <div v-if="hiddenLots > 0" class="flex justify-center"><button type="button" class="st-btn-ghost" @click="showOlder = true">Voir les lots précédents ({{ hiddenLots }})</button></div>

      <div v-if="!clips.length" class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-st-borderStrong px-6 py-12 text-center">
        <span class="flex h-14 w-14 items-center justify-center rounded-full bg-st-accentBg text-st-accentLight" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9.5v5l4.5-2.5z" /></svg>
        </span>
        <h2 class="st-title m-0 text-xl font-bold">Tes premiers clips arriveront après ton prochain live</h2>
        <p class="m-0 max-w-sm text-sm leading-relaxed st-muted">Clippeak surveille ton live et prépare les clips par lots de 4. Tu peux aussi analyser une ancienne vidéo (VOD) dès maintenant.</p>
        <StudioAnalyzeVod />
        <button type="button" class="st-btn-quiet" @click="studio.goToStep(1)">Revoir mes clips de référence</button>
      </div>
      <div v-else-if="!lots.length" class="st-card flex flex-col items-center gap-2.5 !py-8 text-center">
        <h2 class="st-title m-0 text-lg font-bold">Aucun clip ne correspond</h2>
        <p class="m-0 text-sm st-muted">Change ou efface les filtres pour revoir tes clips.</p>
        <button type="button" class="st-btn-ghost" @click="clearFilters">Effacer les filtres</button>
      </div>
    </main>

    <StudioClipDrawer v-if="drawerClip" :clip="drawerClip" @close="drawerId = null" />
    <StudioBulkPublish v-if="bulkLot !== null && bulkClips.length" :lot="bulkLot" :clips="bulkClips" @close="bulkLot = null" />
  </div>
</template>
