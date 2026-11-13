<script setup lang="ts">
// Tableau de bord sur telephone (maquette « Tableau de bord, telephone ») : une barre d'onglets en bas (Accueil, Clips, Reglages) ;
// Accueil = prochaine action, compteurs et « En ce moment » ; Clips = un clip a la fois, du meilleur au moins bon, avec des puces de statut ;
// Reglages = la liste des etapes avec leur etat.
const studio = useStudio()

type Tab = 'home' | 'clips' | 'settings'
type Group = 'review' | 'approved' | 'published' | 'rejected' | 'progress' | 'failed'
const tab = ref<Tab>('clips')
const status = ref<Group>('review')
const index = ref(0)

const clips = computed(() => studio.clips.value.filter(c => c.format !== 'long'))
const groupOf = (c: StudioClip): Group => isPublished(c) ? 'published' : c.status === 'queued' || c.status === 'rendering' ? 'progress' : (c.status as Group)
const count = (g: Group) => clips.value.filter(c => groupOf(c) === g).length

const chips = [
  { key: 'review' as const, label: 'À valider', fg: 'var(--st-accent-text)' },
  { key: 'approved' as const, label: 'Approuvés', fg: 'var(--st-ok)' },
  { key: 'published' as const, label: 'Publiés', fg: 'var(--st-info)' },
  { key: 'rejected' as const, label: 'Refusés', fg: 'var(--st-soft)' }
]
const list = computed(() => clips.value.filter(c => groupOf(c) === status.value).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)))
const total = computed(() => list.value.length)
const safeIndex = computed(() => Math.min(index.value, Math.max(0, total.value - 1)))
const current = computed(() => list.value[safeIndex.value] ?? null)
watch([status, () => studio.channelId.value], () => { index.value = 0 })

function go(next: Tab, group?: Group) {
  tab.value = next
  if (group) { status.value = group; index.value = 0 }
}

// Prochaine action : memes regles que sur ordinateur.
const reviewCount = computed(() => count('review'))
const approvedCount = computed(() => count('approved'))
const lotOfReview = computed(() => clips.value.find(c => c.status === 'review')?.batch ?? 0)
const next = computed(() => reviewCount.value > 0
  ? { title: `Valide les clips du lot ${lotOfReview.value || ''}`.trim(), text: `${reviewCount.value} clip${reviewCount.value > 1 ? 's' : ''} prêt${reviewCount.value > 1 ? 's' : ''} à valider${approvedCount.value ? `, ${approvedCount.value} approuvé${approvedCount.value > 1 ? 's' : ''} en attente de publication` : ''}.`, cta: 'Voir les clips à valider', group: 'review' as Group }
  : approvedCount.value > 0
    ? { title: 'Publie ou télécharge tes clips approuvés', text: `${approvedCount.value} clip${approvedCount.value > 1 ? 's' : ''} approuvé${approvedCount.value > 1 ? 's' : ''}. Rien n’est publié sans toi.`, cta: 'Voir les clips approuvés', group: 'approved' as Group }
    : { title: 'Tout est à jour', text: 'Clippeak te prévient dès qu’un nouveau lot est prêt.', cta: '', group: 'review' as Group })

const rendering = computed(() => count('progress'))
const failedCount = computed(() => count('failed'))

const platformNames: Record<string, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' }
const disconnected = computed(() => {
  const all = clips.value.flatMap(c => c.publications)
  const platforms = [...new Set(all.filter(p => p.status === 'failed' && /reconnecte/i.test(p.error ?? '')).map(p => p.platform))]
  return platforms.filter((pl) => {
    const failedAt = Math.max(...all.filter(p => p.platform === pl && p.status === 'failed').map(p => new Date(p.scheduledAt).getTime()))
    return !all.some(p => p.platform === pl && ['published', 'scheduled', 'publishing'].includes(p.status) && new Date(p.scheduledAt).getTime() > failedAt)
  }).map(pl => ({ id: pl, name: platformNames[pl] ?? pl }))
})

// L'analyse en cours s'affiche dans « En ce moment » (Accueil) : on la relit toutes les 30 secondes.
let analysisTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => { studio.loadAnalysis(); analysisTimer = setInterval(() => { if (!studio.busy.value) studio.loadAnalysis() }, 30_000) })
onBeforeUnmount(() => { if (analysisTimer) clearInterval(analysisTimer) })

const settingsNav = computed(() => STEPS.filter(s => s.n < 8).map(s => ({ ...s, ...studio.stepStatus(s.n) })))
const dot = { ok: 'bg-st-okBg text-st-ok', warn: 'bg-st-warnBg text-st-warn', skip: 'bg-st-raised2 text-st-soft', todo: 'bg-st-raised2 text-st-soft' } as const

const title = computed(() => tab.value === 'home' ? 'Tableau de bord' : tab.value === 'clips' ? 'Mes clips' : 'Mes réglages')
const tabs = [
  { key: 'home' as const, label: 'Accueil', icon: 'M4 11l8-7 8 7M6 10v9h12v-9' },
  { key: 'clips' as const, label: 'Clips', icon: 'M8 5.5v13l11-6.5z' },
  { key: 'settings' as const, label: 'Réglages', icon: 'M5 7h14M5 12h14M5 17h14' }
]
const openLong = () => { try { localStorage.setItem('clippeak.longSeen', '1') } catch {} studio.view.value = 'long' }
</script>

<template>
  <div class="flex min-h-[calc(100vh-56px)] flex-col pb-24">
    <main class="flex flex-col gap-4 px-4 pt-4">
      <h1 class="st-title m-0 text-2xl font-bold leading-8">{{ title }}</h1>

      <StudioVodAlerts />

      <!-- Accueil -->
      <template v-if="tab === 'home'">
        <div v-for="p in disconnected" :key="p.id" class="st-alert st-alert-warn flex-wrap items-center" role="alert">
          <div class="min-w-[200px] flex-1"><strong class="font-extrabold">{{ p.name }} n’est plus connecté.</strong> Reconnecte-le pour y publier.</div>
          <a :href="`/api/auth/${p.id}`" class="st-btn no-underline">Reconnecter {{ p.name }}</a>
        </div>
        <div v-if="studio.quota.value?.reached" class="st-alert st-alert-warn flex-col !items-start" role="alert">
          <div class="font-bold">Plafond du mois atteint ({{ studio.quota.value.used }} / {{ studio.quota.value.limit }} clips)</div>
          <div class="text-[13px] opacity-90">Les nouveaux clips reprennent le mois prochain : tes prochains lives attendent, rien n’est perdu. Besoin de plus de place ? Voir « Mon offre » dans Réglages.</div>
        </div>
        <section class="flex flex-col gap-3 rounded-2xl border border-st-accentBorder bg-st-accentDeep p-[18px]" aria-label="Prochaine action">
          <div class="st-eyebrow">Prochaine action</div>
          <h2 class="st-title m-0 text-xl font-bold leading-[26px]">{{ next.title }}</h2>
          <div class="text-sm leading-[21px] text-st-accentSoft">{{ next.text }}</div>
          <button v-if="next.cta" type="button" class="st-btn !min-h-[52px] w-full" @click="go('clips', next.group)">{{ next.cta }}<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
        </section>
        <div class="grid grid-cols-2 gap-2.5" role="group" aria-label="Clips par statut">
          <button v-for="c in chips" :key="c.key" type="button" class="flex min-h-[78px] flex-col gap-0.5 rounded-[14px] border border-st-border bg-st-surface px-4 py-3.5 text-left text-st-text" @click="go('clips', c.key)">
            <span class="st-title text-[28px] font-bold leading-8">{{ count(c.key) }}</span>
            <span class="text-sm font-bold" :style="{ color: c.fg }">{{ c.label }}</span>
          </button>
        </div>
        <section v-if="studio.analysis.value.length || rendering || failedCount" class="flex flex-col gap-3 rounded-2xl border border-st-border bg-st-surface p-4" aria-label="En ce moment">
          <div class="st-eyebrow !text-st-dim">En ce moment</div>
          <div v-for="a in studio.analysis.value" :key="`${a.kind}-${a.id}`" class="flex items-center gap-3">
            <span class="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-st-infoBg text-st-info" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"><animate attributeName="r" values="3;5;3" dur="1.6s" repeatCount="indefinite" /></circle><circle cx="12" cy="12" r="8" /></svg></span>
            <div><div class="text-sm font-bold">{{ a.kind === 'long' ? 'Analyse pour les extraits longs' : 'Analyse de ton live' }}</div><div class="text-[13px] st-soft">{{ a.title || 'Ton live' }}<template v-if="a.pct != null"> · {{ a.pct }} %</template></div></div>
          </div>
          <div v-if="rendering" class="flex items-center gap-3">
            <span class="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-st-infoBg text-st-info" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3a9 9 0 109 9"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" /></path></svg></span>
            <div><div class="text-sm font-bold">{{ rendering }} clip{{ rendering > 1 ? 's' : '' }} en rendu</div><div class="text-[13px] st-soft">Il{{ rendering > 1 ? 's arrivent' : ' arrive' }} dans ton prochain lot.</div></div>
          </div>
          <button v-if="failedCount" type="button" class="flex items-center gap-3 border-0 bg-transparent p-0 text-left text-st-text" @click="go('clips', 'failed')">
            <span class="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-st-errorBg text-st-error" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l9 16H3zM12 10v4M12 17h.01" /></svg></span>
            <div><div class="text-sm font-bold">{{ failedCount }} clip{{ failedCount > 1 ? 's' : '' }} en échec</div><div class="text-[13px] st-soft">Touche pour le{{ failedCount > 1 ? 's' : '' }} réessayer.</div></div>
          </button>
        </section>
      </template>

      <!-- Clips -->
      <template v-else-if="tab === 'clips'">
        <div role="group" aria-label="Filtrer par statut" class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <button v-for="c in chips" :key="c.key" type="button" :aria-pressed="status === c.key" class="h-11 flex-none whitespace-nowrap rounded-full px-4 text-sm font-bold" :class="status === c.key ? 'border-[1.5px] border-st-accentLight bg-st-accentBg text-st-accentText' : 'border border-st-borderStrong bg-st-raised text-st-text'" @click="status = c.key">{{ c.label }} · {{ count(c.key) }}</button>
          <button v-if="count('progress') || count('failed')" type="button" :aria-pressed="status === 'failed' || status === 'progress'" class="h-11 flex-none whitespace-nowrap rounded-full border border-st-borderStrong bg-st-raised px-4 text-sm font-bold text-st-text" @click="status = count('failed') ? 'failed' : 'progress'">{{ count('failed') ? `En échec · ${count('failed')}` : `En préparation · ${count('progress')}` }}</button>
        </div>
        <template v-if="total > 0 && current">
          <div class="flex items-center justify-between gap-2">
            <div class="text-[13px] font-bold st-soft">Clip {{ safeIndex + 1 }} sur {{ total }} · meilleurs d’abord</div>
            <div class="flex gap-1.5">
              <button type="button" class="flex h-11 w-11 items-center justify-center rounded-[10px] border border-st-borderStrong bg-st-raised text-st-text disabled:text-st-dim" :disabled="safeIndex === 0" aria-label="Clip précédent" @click="index = Math.max(0, safeIndex - 1)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></button>
              <button type="button" class="flex h-11 w-11 items-center justify-center rounded-[10px] border border-st-borderStrong bg-st-raised text-st-text disabled:text-st-dim" :disabled="safeIndex >= total - 1" aria-label="Clip suivant" @click="index = Math.min(total - 1, safeIndex + 1)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
            </div>
          </div>
          <StudioClipCard :key="current.id" :clip="current" stacked />
        </template>
        <div v-else class="flex flex-col gap-2 rounded-2xl border border-st-border bg-st-surface px-5 py-7 text-center">
          <div class="st-title text-lg font-bold">Aucun clip ici</div>
          <div class="text-sm leading-[21px] st-muted">Aucun clip n’a ce statut pour l’instant.</div>
        </div>
      </template>

      <!-- Reglages -->
      <template v-else>
        <div class="flex flex-col gap-1.5">
          <button type="button" class="flex min-h-14 w-full items-center gap-3 rounded-xl border border-st-border bg-st-surface px-3.5 text-left text-[15px] font-semibold text-st-text" @click="openLong">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="flex-none"><path d="M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M16 9h4M4 15h4M16 15h4" /></svg>
            <span class="flex-1">Extraits longs</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--st-dim)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <div class="px-1 pb-1 pt-3 text-xs font-extrabold uppercase tracking-widest text-st-dim">Mes réglages</div>
          <button v-for="s in settingsNav" :key="s.n" type="button" class="flex min-h-14 w-full items-center gap-3 rounded-xl border border-st-border bg-st-surface px-3.5 text-left text-[15px] font-semibold text-st-text" @click="studio.goToStep(s.n)">
            <span class="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full" :class="dot[s.status]" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path v-if="s.status === 'ok'" d="M5 12.5l4.5 4.5L19 7.5" /><path v-else-if="s.status === 'warn'" d="M12 6v8M12 18h.01" /><path v-else d="M6 12h12" /></svg>
            </span>
            <span class="sr-only">{{ ({ ok: 'Terminée', warn: 'À revoir', skip: 'Passée', todo: 'À faire' } as const)[s.status] }}.</span>
            <span class="flex-1">{{ s.label }}</span>
            <span v-if="s.status === 'warn' || s.status === 'skip'" class="text-xs font-bold" :class="s.status === 'warn' ? 'text-st-warn' : 'text-st-soft'">{{ s.status === 'warn' ? 'À revoir' : 'Passée' }}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--st-dim)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <p v-if="studio.quota.value && studio.quota.value.limit !== null" class="m-0 px-1 pt-2 text-[13px] st-muted">Clips ce mois-ci : {{ studio.quota.value.used }} / {{ studio.quota.value.limit }}</p>
        </div>
        <StudioBilling />
      </template>
    </main>

    <nav aria-label="Navigation" class="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-st-border bg-st-bg px-2 pb-2.5 pt-1.5">
      <button v-for="t in tabs" :key="t.key" type="button" :aria-current="tab === t.key ? 'page' : undefined" class="flex h-14 flex-col items-center justify-center gap-[3px] rounded-xl border-0 text-xs font-bold" :class="tab === t.key ? 'bg-st-accentBg text-white' : 'bg-transparent text-st-muted'" @click="tab = t.key">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="t.icon" /></svg>{{ t.label }}
      </button>
    </nav>
  </div>
</template>
