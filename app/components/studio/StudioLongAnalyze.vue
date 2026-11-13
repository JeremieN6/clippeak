<script setup lang="ts">
// Carte « Analyser un live » (maquette « Carte · Analyser un live ») : choisir un live termine, lancer l'analyse, suivre son avancement.
// Etats : pas lancee, en cours (pourcentage), terminee (N propositions), impossible (VOD privee ou supprimee), en echec.
import { formatClock } from '~~/server/utils/clipping/longExtract'

const props = defineProps<{ info: LongExtractsInfo }>()
const emit = defineEmits<{ changed: [], 'show-proposals': [] }>()
const studio = useStudio()

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
const vodLabel = (v: LongExtractVod) => `${v.title || 'Live sans titre'} · ${fmtDate(v.startedAt)}${v.durationSec ? ` · ${formatClock(v.durationSec)}` : ''}`

const vodId = ref(props.info.vods[0]?.id ?? '')
watch(() => props.info.vods, (list) => { if (!list.some(v => v.id === vodId.value)) vodId.value = list[0]?.id ?? '' })

const analysis = computed(() => props.info.analyses.find(a => a.vodId === vodId.value) ?? null)
const state = computed<'idle' | 'run' | 'done' | 'impossible' | 'failed'>(() => {
  const s = analysis.value?.status
  return s === 'queued' || s === 'running' ? 'run' : s === 'done' ? 'done' : s === 'impossible' ? 'impossible' : s === 'failed' ? 'failed' : 'idle'
})
// Une autre analyse tourne deja (une seule a la fois par chaine).
const otherRunning = computed(() => props.info.analyses.some(a => a.vodId !== vodId.value && (a.status === 'queued' || a.status === 'running')))
const proposalsHere = computed(() => props.info.proposals.filter(p => p.vod.id === vodId.value && p.origin === 'analysis').length)

async function start() {
  if (!vodId.value) return
  await studio.startLongAnalysis(vodId.value)
  emit('changed')
}
</script>

<template>
  <section class="st-card flex flex-col gap-4 !p-5" aria-labelledby="la-t">
    <div class="flex flex-col gap-1.5">
      <div class="flex flex-wrap items-center gap-2"><h2 id="la-t" class="st-title m-0 text-lg font-bold">Après ton live : analyser un live</h2><span class="st-badge st-badge-ok">Disponible</span></div>
      <p class="m-0 text-sm leading-relaxed st-muted">Clippeak lit tout ton live, le découpe par sujet et te propose des extraits : titre, durée, note et thème. Rien n’est préparé ni publié sans toi.</p>
    </div>

    <div v-if="!info.vods.length" class="text-sm st-muted">Aucun live terminé pour l’instant : après ton prochain live, tu pourras l’analyser ici.</div>
    <template v-else>
      <label class="flex flex-col gap-1.5">
        <span class="st-label">Live à analyser</span>
        <select v-model="vodId" class="st-field">
          <option v-for="v in info.vods" :key="v.id" :value="v.id">{{ vodLabel(v) }}</option>
        </select>
      </label>

      <div v-if="state === 'idle'" class="flex flex-col gap-2.5">
        <div><button type="button" class="st-btn" :disabled="studio.busy.value || otherRunning" @click="start">Analyser ce live</button></div>
        <div class="text-[13px] leading-5 st-muted">Pour un long live, ça peut prendre plusieurs heures.<template v-if="otherRunning"> Une autre analyse est en cours : attends qu’elle soit terminée.</template></div>
      </div>

      <div v-else-if="state === 'run'" class="flex flex-col gap-3">
        <div role="status" class="flex items-start gap-3 rounded-xl bg-st-infoBg px-3.5 py-3.5 text-st-info">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true" class="mt-px flex-none"><path d="M12 3a9 9 0 109 9"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" /></path></svg>
          <div class="text-sm leading-[21px]"><strong class="font-extrabold">Analyse en cours · environ {{ analysis?.progress ?? 0 }} %</strong><div class="mt-0.5 opacity-90">Ça peut prendre plusieurs heures. Tu peux fermer cette page : tu seras prévenu dans la cloche quand c’est prêt.</div></div>
        </div>
        <div class="h-2 overflow-hidden rounded bg-st-raised2" role="progressbar" aria-label="Avancement approximatif de l’analyse" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="analysis?.progress ?? 0"><div class="st-bar h-full" :style="{ width: `${analysis?.progress ?? 0}%` }" /></div>
        <div><button type="button" class="st-btn" disabled>Analyse en cours…</button></div>
      </div>

      <div v-else-if="state === 'done'" class="flex flex-col gap-3">
        <div role="status" class="flex items-start gap-3 rounded-xl bg-st-okBg px-3.5 py-3.5 text-st-ok">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mt-px flex-none"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          <div class="text-sm leading-[21px]">
            <strong class="font-extrabold">Analyse terminée : {{ analysis?.proposals ?? 0 }} proposition{{ (analysis?.proposals ?? 0) > 1 ? 's' : '' }}</strong>
            <div class="mt-0.5 opacity-90">{{ (analysis?.proposals ?? 0) > 0 ? 'Elles sont dans « Propositions d’extraits », juste en dessous.' : 'Aucun passage assez solide dans ce live. Tu peux en ajouter à la main.' }}</div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button v-if="proposalsHere" type="button" class="st-btn min-w-[180px] flex-1" @click="emit('show-proposals')">Voir les propositions</button>
          <button type="button" class="st-btn-ghost min-w-[140px] flex-1" :disabled="studio.busy.value || otherRunning" @click="start">Relancer l’analyse</button>
        </div>
        <div class="text-[13px] leading-5 st-muted">Relancer remplace les propositions que tu n’as pas touchées ; celles que tu as ignorées ou préparées restent.</div>
      </div>

      <div v-else-if="state === 'impossible'" class="flex flex-col gap-3">
        <div role="alert" class="flex items-start gap-3 rounded-xl bg-st-warnBg px-3.5 py-3.5 text-st-warn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mt-px flex-none"><path d="M12 4l9 16H3zM12 10v4M12 17h.01" /></svg>
          <div class="text-sm leading-[21px]"><strong class="font-extrabold">Analyse impossible : la VOD de ce live est privée ou a été supprimée.</strong><div class="mt-0.5 opacity-90">Rends-la publique sur Twitch, ou choisis un autre live.</div></div>
        </div>
        <div><button type="button" class="st-btn-ghost" :disabled="studio.busy.value || otherRunning" @click="start">Réessayer</button></div>
      </div>

      <div v-else class="flex flex-col gap-3">
        <div role="alert" class="flex items-start gap-3 rounded-xl bg-st-errorBg px-3.5 py-3.5 text-st-error">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" class="mt-px flex-none"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" /></svg>
          <div class="text-sm leading-[21px]"><strong class="font-extrabold">L’analyse a échoué.</strong><div class="mt-0.5 opacity-90">Un problème est survenu de notre côté. Réessaie dans un moment.<template v-if="analysis?.error"> ({{ analysis.error }})</template></div></div>
        </div>
        <div><button type="button" class="st-btn" :disabled="studio.busy.value || otherRunning" @click="start">Réessayer</button></div>
      </div>
    </template>

    <div class="flex items-start justify-between gap-3.5 border-t border-st-border pt-3.5">
      <div class="flex min-w-0 flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2"><span class="text-sm font-bold text-st-soft">Analyser mes lives automatiquement</span><span class="st-badge st-badge-neutral">Bientôt</span></div>
        <div class="text-[13px] leading-5 st-muted">Après chaque live, Clippeak analysera tout seul.</div>
      </div>
      <button type="button" role="switch" aria-checked="false" aria-disabled="true" disabled aria-label="Analyser mes lives automatiquement, bientôt disponible" class="flex h-11 w-[52px] flex-none items-center justify-center border-0 bg-transparent p-0 opacity-50">
        <span class="relative block h-[26px] w-11 rounded-full bg-st-borderStrong"><span class="absolute left-[3px] top-[3px] h-5 w-5 rounded-full bg-white" /></span>
      </button>
    </div>
  </section>
</template>
