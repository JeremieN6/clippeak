<script setup lang="ts">
// Carte d'une proposition d'extrait long (maquette « Carte · Proposition d'extrait ») : origine, etat, note, titre modifiable, duree et theme,
// repere dans le live avec lien Twitch, « Pourquoi cette note ? », puis Preparer / Ajuster le debut et la fin / Ignorer (avec Annuler).
import { LONG_MIN_SEC, formatClock, parseClock, validateLongRange } from '~~/server/utils/clipping/longExtract'

const props = defineProps<{ proposal: LongProposalView, maxSec: number, vodDurationSec: number | null }>()
const emit = defineEmits<{ changed: [], 'show-videos': [] }>()
const studio = useStudio()

const p = computed(() => props.proposal)
const origin = computed(() => ({ manual: 'Ajout manuel', streamer: 'Repère du streamer', analysis: 'Analyse du live' })[p.value.origin])
const stateLook = computed(() => ({
  proposed: { label: 'Proposée', cls: 'st-badge-violet' },
  preparing: { label: 'En préparation', cls: 'st-badge-info' },
  validate: { label: 'Dans « À valider »', cls: 'st-badge-ok' },
  ignored: { label: 'Ignorée', cls: 'st-badge-neutral' }
})[p.value.state])
const score = computed(() => p.value.score == null ? '' : p.value.score.toFixed(1).replace('.', ',').replace(',0', ''))

const title = ref(p.value.title)
watch(() => p.value.title, (t) => { title.value = t })
const whyOpen = ref(false)
const adjOpen = ref(false)
const sDraft = ref('')
const eDraft = ref('')
const locked = computed(() => p.value.state !== 'proposed')

const twitchUrl = computed(() => {
  const s = Math.floor(p.value.startSec)
  return `https://www.twitch.tv/videos/${p.value.vod.twitchVodId}?t=${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m${s % 60}s`
})

function openAdjust() { sDraft.value = formatClock(p.value.startSec, true); eDraft.value = formatClock(p.value.endSec, true); adjOpen.value = true }
const adjusted = computed(() => ({ s: parseClock(sDraft.value), e: parseClock(eDraft.value) }))
const adjProblem = computed(() => {
  const { s, e } = adjusted.value
  if (s === null || e === null) return 'Écris le temps comme dans Twitch, par exemple 1:23:10.'
  return validateLongRange({ startSec: s, endSec: e, maxSec: props.maxSec, vodDurationSec: props.vodDurationSec })
})
const adjMessage = computed(() => adjProblem.value || `Durée : ${formatClock((adjusted.value.e ?? 0) - (adjusted.value.s ?? 0))}`)

async function saveAdjust() {
  if (adjProblem.value) return
  await studio.updateLongProposal(p.value.id, { startSec: adjusted.value.s!, endSec: adjusted.value.e! }, 'Repère enregistré.')
  if (!studio.error.value) { adjOpen.value = false; emit('changed') }
}
async function prepare() {
  if (title.value.trim() && title.value.trim() !== p.value.title) await studio.updateLongProposal(p.value.id, { title: title.value.trim() })
  if (studio.error.value) return
  await studio.prepareLongProposal(p.value.id)
  emit('changed')
}
async function setIgnored(ignored: boolean) {
  await studio.updateLongProposal(p.value.id, { ignored })
  emit('changed')
}
</script>

<template>
  <article class="st-card flex h-full flex-col gap-3.5 !p-5" :class="p.state === 'validate' ? '!border-st-okBorder' : ''" :aria-label="p.title">
    <div class="flex flex-wrap items-center gap-2">
      <span class="inline-flex min-h-[26px] items-center rounded-full bg-st-raised2 px-2.5 text-xs font-bold text-st-soft">{{ origin }}</span>
      <span class="st-badge" :class="stateLook.cls">{{ stateLook.label }}</span>
      <span v-if="score" class="st-badge ml-auto !bg-st-accentBg !font-extrabold !text-st-accentText" :aria-label="`Note : ${score} sur 10`">{{ score }} / 10</span>
    </div>

    <div class="flex flex-col gap-1.5" :class="p.state === 'ignored' ? 'opacity-55' : ''">
      <label :for="`lp-title-${p.id}`" class="st-label">Titre de l’extrait</label>
      <input :id="`lp-title-${p.id}`" v-model="title" class="st-field" maxlength="100" :disabled="locked">
    </div>

    <div class="flex flex-col gap-1.5 text-sm leading-[21px]" :class="p.state === 'ignored' ? 'opacity-55' : ''">
      <div class="flex flex-wrap items-baseline gap-x-2">
        <span class="font-extrabold">{{ formatClock(p.durationSec) }}</span>
        <template v-if="p.theme"><span class="st-muted">Thème :</span><span class="font-semibold">{{ p.theme }}</span></template>
      </div>
      <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 st-muted">
        <span>Dans le live « {{ p.vod.title || 'sans titre' }} » : <strong class="font-bold text-st-text">{{ formatClock(p.startSec, true) }} → {{ formatClock(p.endSec, true) }}</strong></span>
        <a :href="twitchUrl" target="_blank" rel="noopener" class="inline-flex min-h-8 items-center gap-1 font-bold text-st-accentLight no-underline">Voir sur Twitch<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg></a>
      </div>
    </div>

    <div v-if="p.why" :class="p.state === 'ignored' ? 'opacity-55' : ''">
      <button type="button" class="inline-flex min-h-11 items-center gap-1.5 border-0 bg-transparent px-0.5 text-sm font-bold text-st-accentLight" :aria-expanded="whyOpen" :aria-controls="`lp-why-${p.id}`" @click="whyOpen = !whyOpen">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" :class="whyOpen ? 'rotate-90' : ''"><path d="M9 6l6 6-6 6" /></svg>
        Pourquoi cette note ?
      </button>
      <div v-if="whyOpen" :id="`lp-why-${p.id}`" class="mt-0.5 rounded-[10px] border border-st-border bg-st-field px-3.5 py-3 text-sm leading-[22px] text-st-soft">{{ p.why }}</div>
    </div>

    <div v-if="adjOpen" role="group" aria-label="Ajuster le début et la fin" class="flex flex-col gap-3 rounded-xl border border-st-accentBorder bg-st-field p-3.5">
      <div class="grid grid-cols-2 gap-2.5">
        <label class="flex flex-col gap-1.5 text-[13px] font-bold st-muted">Début<input v-model="sDraft" class="st-field" inputmode="numeric" placeholder="1:23:10" autocomplete="off"></label>
        <label class="flex flex-col gap-1.5 text-[13px] font-bold st-muted">Fin<input v-model="eDraft" class="st-field" inputmode="numeric" placeholder="1:30:52" autocomplete="off"></label>
      </div>
      <div role="status" class="text-[13px] leading-5" :class="adjProblem ? 'font-semibold text-st-error' : 'st-muted'">{{ adjMessage }}</div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="st-btn flex-1" :disabled="!!adjProblem || studio.busy.value" @click="saveAdjust">Enregistrer le repère</button>
        <button type="button" class="st-btn-ghost flex-1" @click="adjOpen = false">Annuler</button>
      </div>
    </div>

    <div v-if="p.state === 'preparing'" class="mt-auto flex flex-col gap-2">
      <div role="status" class="text-sm font-bold text-st-info">Préparation de l’extrait…<template v-if="p.progress != null"> {{ p.progress }} %</template></div>
      <div class="h-2 overflow-hidden rounded bg-st-raised2" role="progressbar" aria-label="Avancement de la préparation" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="p.progress ?? undefined"><div class="st-bar h-full" :class="p.progress == null ? 'st-bar-live' : ''" :style="{ width: `${p.progress ?? 60}%` }" /></div>
      <div class="text-[13px] leading-5 st-muted">Ça prend quelques minutes. Tu peux continuer à parcourir les propositions.</div>
    </div>

    <div v-else-if="p.state === 'validate'" role="status" class="mt-auto flex items-start gap-2.5 rounded-xl bg-st-okBg px-3.5 py-3 text-sm leading-[21px] text-st-ok">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mt-0.5 flex-none"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      <div><strong class="font-extrabold">Cet extrait est passé dans « À valider ».</strong> <button type="button" class="border-0 bg-transparent p-0 font-bold text-st-ok underline" @click="emit('show-videos')">Voir dans « À valider »</button></div>
    </div>

    <div v-else-if="p.state === 'ignored'" class="mt-auto flex flex-wrap items-center justify-between gap-2.5">
      <span class="text-sm st-muted">Tu as ignoré cette proposition.</span>
      <button type="button" class="st-btn-ghost" :disabled="studio.busy.value" @click="setIgnored(false)">Annuler</button>
    </div>

    <div v-else class="mt-auto flex flex-wrap gap-2 pt-0.5">
      <button type="button" class="st-btn min-w-[180px] flex-1" :disabled="adjOpen || studio.busy.value" @click="prepare">Préparer l’extrait</button>
      <button type="button" class="st-btn-ghost min-w-[180px] flex-1" :disabled="studio.busy.value" @click="openAdjust">Ajuster le début et la fin</button>
      <button type="button" class="st-btn-quiet" :disabled="studio.busy.value" @click="setIgnored(true)">Ignorer</button>
    </div>
    <p v-if="!adjOpen && p.state === 'proposed'" class="m-0 text-[12px] leading-4 st-muted">Un extrait dure de {{ LONG_MIN_SEC / 60 }} minutes à {{ formatClock(maxSec) }}.</p>
  </article>
</template>
