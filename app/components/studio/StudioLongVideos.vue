<script setup lang="ts">
// Page « Extraits longs » (maquette « Extraits longs · page complete ») : YouTube, reglage, comment recevoir des propositions, propositions
// d'extraits (filtres, regroupees par live), puis les videos preparees par etat. Un extrait long est un passage continu du live, en 16:9.
import { formatClock } from '~~/server/utils/clipping/longExtract'

const studio = useStudio()
const info = ref<LongExtractsInfo | null>(null)
const failed = ref(false)
const addOpen = ref(false)
const videosEl = ref<HTMLElement | null>(null)

async function load() {
  if (!studio.channelId.value) return
  try {
    info.value = await studio.loadLongExtracts()
    failed.value = false
  } catch {
    failed.value = true
  }
}
async function refresh() { await Promise.all([load(), studio.loadClips()]) }
onMounted(load)
watch(() => studio.channelId.value, load)

const back = () => { studio.view.value = studio.onboarding.value?.completed || studio.clips.value.length ? 'dashboard' : 'onboarding' }
const youtube = computed(() => studio.connections.value.find(c => c.platform === 'youtube'))
const showVideos = () => videosEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })

// --- Propositions : filtres et regroupement par live
const filters = reactive({ live: 'all', origin: 'all', note: 'all', length: 'all' })
const proposals = computed(() => info.value?.proposals ?? [])
const passes = (p: LongProposalView) => {
  if (filters.live !== 'all' && p.vod.id !== filters.live) return false
  if (filters.origin !== 'all' && p.origin !== filters.origin) return false
  if (filters.note !== 'all' && (p.score ?? 0) < Number(filters.note)) return false
  if (filters.length === 'short' && p.durationSec > 300) return false
  if (filters.length === 'mid' && (p.durationSec <= 300 || p.durationSec > 600)) return false
  if (filters.length === 'long' && p.durationSec <= 600) return false
  return true
}
const filtered = computed(() => proposals.value.filter(passes))
const filtersOn = computed(() => Object.values(filters).some(v => v !== 'all'))
const clearFilters = () => { filters.live = 'all'; filters.origin = 'all'; filters.note = 'all'; filters.length = 'all' }
const liveOptions = computed(() => [...new Map(proposals.value.map(p => [p.vod.id, p.vod])).values()])
const byLive = computed(() => liveOptions.value
  .map(v => ({ vod: v, list: filtered.value.filter(p => p.vod.id === v.id) }))
  .filter(g => g.list.length))
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
const vodDuration = (id: string) => info.value?.vods.find(v => v.id === id)?.durationSec ?? null
const selectClass = 'st-field !min-h-11 !w-full'

// --- Videos preparees, par etat
type Group = 'validate' | 'ready' | 'preparing' | 'published' | 'failed' | 'refused'
const groupOf = (c: StudioClip): Group => isPublished(c) ? 'published' : c.status === 'queued' || c.status === 'rendering' ? 'preparing' : c.status === 'review' ? 'validate' : c.status === 'approved' ? 'ready' : c.status === 'failed' ? 'failed' : 'refused'
const groups: Array<{ key: Group, title: string, hint: string }> = [
  { key: 'validate', title: 'À valider', hint: 'Regarde l’extrait, ajuste le titre et la légende, puis approuve-le ou refuse-le.' },
  { key: 'ready', title: 'Prêtes à publier', hint: 'Approuvées : rien n’est publié tant que tu ne le demandes pas.' },
  { key: 'preparing', title: 'En préparation', hint: 'Clippeak découpe la vidéo, compte quelques minutes.' },
  { key: 'published', title: 'Publiées', hint: '' },
  { key: 'failed', title: 'En échec', hint: 'La préparation a échoué : tu peux la relancer depuis la carte.' },
  { key: 'refused', title: 'Refusées', hint: '' }
]
const longClips = computed(() => studio.clips.value.filter(c => c.format === 'long'))
const sections = computed(() => groups
  .map(g => ({ ...g, list: longClips.value.filter(c => groupOf(c) === g.key).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) }))
  .filter(g => g.list.length))

// Tant qu'un extrait se prepare ou s'envoie, la page se rafraichit toute seule.
const working = () => proposals.value.some(p => p.state === 'preparing')
  || longClips.value.some(c => groupOf(c) === 'preparing' || c.publications.some(p => p.platform === 'youtube' && (p.status === 'scheduled' || p.status === 'publishing')))
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { if (!studio.busy.value && working()) refresh() }, 10_000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <main class="mx-auto flex w-full max-w-[1080px] flex-col gap-7 px-5 pb-16 pt-6 sm:px-8 sm:pt-9">
    <div class="flex max-w-[680px] flex-col gap-2">
      <button type="button" class="-ml-2 inline-flex h-11 items-center gap-1.5 self-start rounded-[10px] border-0 bg-transparent px-2 text-sm font-bold text-st-muted hover:text-st-text" @click="back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        Retour
      </button>
      <h1 class="st-title m-0 text-[34px] font-extrabold leading-10">Extraits longs</h1>
      <p class="m-0 text-base leading-[26px] st-muted">
        Publie sur YouTube un passage de ton live de plusieurs minutes, au format horizontal 16:9, en plus de tes clips verticaux.
        Clippeak te propose des passages ; tu choisis, tu vérifies, puis tu publies.
      </p>
    </div>

    <section class="st-card flex flex-col gap-3 !p-5" aria-label="Connexion YouTube">
      <div class="flex flex-wrap items-center gap-3">
        <span class="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-st-errorBg text-st-error" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 7l8 5-8 5z" /></svg></span>
        <h2 class="st-title m-0 text-lg font-bold">YouTube</h2>
        <span v-if="youtube?.connected" class="st-badge st-badge-ok">Connecté</span>
        <span v-else class="st-badge st-badge-warn">Non connecté</span>
        <a v-if="youtube?.available && !youtube?.connected" href="/api/auth/youtube" class="st-btn ml-auto no-underline">Connecter YouTube</a>
        <button v-else-if="youtube?.connected" type="button" class="st-btn-ghost ml-auto" :disabled="studio.busy.value" @click="studio.disconnectPlatform('youtube')">Déconnecter</button>
      </div>
      <p class="m-0 text-sm leading-relaxed st-muted">
        <template v-if="youtube?.connected">Les extraits sont publiés sur la chaîne que tu as choisie à la connexion.<template v-if="youtube?.accountName"> Compte : {{ youtube.accountName }}.</template></template>
        <template v-else>Connecte ta chaîne pour pouvoir publier tes extraits longs. Pour une chaîne secondaire (compte de marque), choisis-la quand Google te demande sur quelle chaîne publier.</template>
        Tant que Google n’a pas validé Clippeak, YouTube garde les vidéos en privé : tu pourras les passer en public depuis YouTube Studio.
      </p>
    </section>

    <p v-if="failed" class="st-alert st-alert-error m-0" role="alert">Impossible de charger cette page pour le moment. Recharge-la (Ctrl+F5) ; si ça continue, écris à contact.clippeak@sassify.fr.</p>

    <template v-else-if="info">
      <StudioLongExtracts :info="info" @changed="load" />

      <template v-if="info.enabled">
        <section class="flex flex-col gap-3" aria-label="Comment recevoir des propositions">
          <h2 class="st-title m-0 text-lg font-bold">Comment recevoir des propositions</h2>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-3">
            <div class="st-card flex flex-col gap-2 !p-4">
              <div class="flex flex-wrap items-center gap-2"><span class="font-bold">Pendant ton live</span><span class="st-badge st-badge-neutral">Bientôt</span></div>
              <p class="m-0 text-sm leading-relaxed st-muted">Tape <code class="rounded bg-st-raised2 px-1.5 py-0.5 text-[0.92em] text-st-accentText">!extrait</code> dans ton chat au début d’un bon passage et <code class="rounded bg-st-raised2 px-1.5 py-0.5 text-[0.92em] text-st-accentText">!fin</code> à la fin : Clippeak te le proposera.</p>
            </div>
            <div class="st-card flex flex-col gap-2 !p-4">
              <div class="flex flex-wrap items-center gap-2"><span class="font-bold">Après ton live</span><span class="st-badge st-badge-neutral">Bientôt</span></div>
              <p class="m-0 text-sm leading-relaxed st-muted">« Analyser ce live » : Clippeak lit tout ton live, le découpe par sujet et te propose des extraits. Pour l’analyse automatique après chaque live, ce sera ensuite.</p>
              <div><button type="button" class="st-btn" disabled>Analyser ce live</button></div>
            </div>
            <div class="st-card flex flex-col gap-2 !p-4">
              <div class="flex flex-wrap items-center gap-2"><span class="font-bold">À la main</span><span class="st-badge st-badge-ok">Disponible</span></div>
              <p class="m-0 text-sm leading-relaxed st-muted">Tu connais déjà le passage : ajoute-le avec son début et sa fin.</p>
              <div><button type="button" class="st-btn-ghost" :aria-expanded="addOpen" @click="addOpen = !addOpen">{{ addOpen ? 'Fermer' : 'Ajouter à la main' }}</button></div>
            </div>
          </div>
          <div v-if="addOpen" class="st-card !p-5"><StudioLongManualAdd :info="info" @changed="load" /></div>
        </section>

        <section class="flex flex-col gap-4" aria-label="Propositions d’extraits">
          <div class="flex flex-col gap-0.5">
            <h2 class="st-title m-0 text-[22px] font-bold leading-7">Propositions d’extraits <span v-if="proposals.length" class="text-base font-semibold st-muted">({{ proposals.length }})</span></h2>
            <div class="text-[13px] st-muted">Choisis ceux que tu veux préparer : un extrait préparé passe dans « À valider ».</div>
          </div>

          <div v-if="proposals.length" class="grid grid-cols-2 items-end gap-3 sm:grid-cols-4" aria-label="Filtres">
            <div class="flex flex-col gap-1.5"><label for="lp-f-live" class="text-xs font-bold text-st-dim">Live</label>
              <select id="lp-f-live" v-model="filters.live" :class="selectClass"><option value="all">Tous</option><option v-for="v in liveOptions" :key="v.id" :value="v.id">{{ v.title || 'Live sans titre' }} · {{ fmtDate(v.startedAt) }}</option></select></div>
            <div class="flex flex-col gap-1.5"><label for="lp-f-origin" class="text-xs font-bold text-st-dim">Origine</label>
              <select id="lp-f-origin" v-model="filters.origin" :class="selectClass"><option value="all">Toutes</option><option value="streamer">Repère du streamer</option><option value="analysis">Analyse du live</option><option value="manual">Ajout manuel</option></select></div>
            <div class="flex flex-col gap-1.5"><label for="lp-f-note" class="text-xs font-bold text-st-dim">Note minimale</label>
              <select id="lp-f-note" v-model="filters.note" :class="selectClass"><option value="all">Toutes</option><option value="6">6 / 10 et plus</option><option value="7">7 / 10 et plus</option><option value="8">8 / 10 et plus</option></select></div>
            <div class="flex flex-col gap-1.5"><label for="lp-f-len" class="text-xs font-bold text-st-dim">Durée</label>
              <select id="lp-f-len" v-model="filters.length" :class="selectClass"><option value="all">Toutes</option><option value="short">5 minutes ou moins</option><option value="mid">5 à 10 minutes</option><option value="long">Plus de 10 minutes</option></select></div>
          </div>
          <div v-if="filtersOn"><button type="button" class="st-btn-quiet text-sm" @click="clearFilters">Effacer les filtres</button></div>

          <template v-if="byLive.length">
            <div v-for="g in byLive" :key="g.vod.id" class="flex flex-col gap-3">
              <h3 class="m-0 text-base font-bold">{{ g.vod.title || 'Live sans titre' }} <span class="text-[13px] font-semibold st-muted">· {{ fmtDate(g.vod.startedAt) }}</span></h3>
              <div class="grid grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] items-stretch gap-4">
                <StudioLongProposalCard v-for="p in g.list" :key="p.id" :proposal="p" :max-sec="info.maxSec" :vod-duration-sec="vodDuration(p.vod.id)" @changed="refresh" @show-videos="showVideos" />
              </div>
            </div>
          </template>
          <div v-else-if="proposals.length" role="status" class="rounded-[14px] border border-dashed border-st-borderStrong px-5 py-5 text-center text-sm leading-[22px] st-muted">Aucune proposition ne correspond à ces filtres.</div>
          <div v-else class="flex flex-col gap-3.5 rounded-2xl border border-dashed border-st-borderStrong p-7">
            <div class="flex items-center gap-3"><span class="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-st-accentBg text-st-accentLight" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v14H4zM8 5v14M16 5v14" /></svg></span><div class="st-title text-lg font-bold">Rien de proposé pour l’instant</div></div>
            <div class="text-sm leading-[22px] text-st-soft">Pour recevoir des propositions, choisis une de ces façons :</div>
            <ul class="m-0 flex list-disc flex-col gap-2 pl-5 text-sm leading-[22px]">
              <li>Pendant ton prochain live, tape <code class="rounded bg-st-raised2 px-1.5 py-0.5 text-[0.92em] text-st-accentText">!extrait</code> au début du passage et <code class="rounded bg-st-raised2 px-1.5 py-0.5 text-[0.92em] text-st-accentText">!fin</code> à la fin (bientôt).</li>
              <li>Pour un live déjà terminé, « Analyser ce live » (bientôt).</li>
              <li>Ou ajoute un passage à la main avec « Ajouter à la main » ci-dessus.</li>
            </ul>
          </div>
        </section>
      </template>
      <div v-else class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-st-borderStrong px-6 py-8 text-center">
        <h2 class="st-title m-0 text-lg font-bold">Les extraits longs sont désactivés</h2>
        <p class="m-0 max-w-md text-sm leading-[22px] st-muted">Active « Activer les extraits longs » ci-dessus pour recevoir des propositions.</p>
      </div>
    </template>

    <div ref="videosEl" class="flex flex-col gap-7" aria-label="Vidéos préparées">
      <template v-if="sections.length">
        <section v-for="s in sections" :key="s.key" class="flex flex-col gap-4">
          <div class="flex flex-col gap-0.5">
            <h2 class="st-title m-0 text-[22px] font-bold leading-7">{{ s.title }} <span class="text-base font-semibold st-muted">({{ s.list.length }})</span></h2>
            <div v-if="s.hint" class="text-[13px] st-muted">{{ s.hint }}</div>
          </div>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-stretch gap-4">
            <StudioLongVideoCard v-for="c in s.list" :key="c.id + c.status" :clip="c" />
          </div>
        </section>
      </template>
      <div v-else-if="info?.enabled" role="status" class="rounded-[14px] border border-dashed border-st-borderStrong px-5 py-5 text-center text-sm leading-[22px] st-muted">Aucune vidéo ici pour l’instant.</div>
    </div>
  </main>
</template>
