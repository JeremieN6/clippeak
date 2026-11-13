<script setup lang="ts">
// « Ajouter à la main » : le streamer choisit un live, un debut et une fin ; la proposition apparait dans « Propositions d'extraits ».
import { formatClock, parseClock, validateLongRange } from '~~/server/utils/clipping/longExtract'

const props = defineProps<{ info: LongExtractsInfo }>()
const emit = defineEmits<{ changed: [] }>()
const studio = useStudio()
const vodId = ref(props.info.vods[0]?.id ?? '')
watch(() => props.info.vods, (list) => { if (!list.some(v => v.id === vodId.value)) vodId.value = list[0]?.id ?? '' })
const start = ref('')
const end = ref('')
const title = ref('')
const sent = ref(false)

const vod = computed(() => props.info.vods.find(v => v.id === vodId.value) ?? null)
const startSec = computed(() => parseClock(start.value))
const endSec = computed(() => parseClock(end.value))
const problem = computed(() => {
  if (startSec.value === null || endSec.value === null) return start.value || end.value ? 'Écris le temps comme dans Twitch, par exemple 1:23:10.' : ''
  return validateLongRange({ startSec: startSec.value, endSec: endSec.value, maxSec: props.info.maxSec, vodDurationSec: vod.value?.durationSec })
})
const length = computed(() => startSec.value !== null && endSec.value !== null && endSec.value > startSec.value ? formatClock(endSec.value - startSec.value) : '')
const canSend = computed(() => !!vod.value && startSec.value !== null && endSec.value !== null && !problem.value && !studio.busy.value)

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
const vodLabel = (v: LongExtractVod) => `${v.title || 'Live sans titre'} · ${fmtDate(v.startedAt)}${v.durationSec ? ` · ${formatClock(v.durationSec)}` : ''}`

async function send() {
  if (!canSend.value || !vod.value || startSec.value === null || endSec.value === null) return
  sent.value = false
  await studio.addLongProposal({ vodId: vod.value.id, startSec: startSec.value, endSec: endSec.value, title: title.value.trim() || undefined })
  if (!studio.error.value) { sent.value = true; start.value = ''; end.value = ''; title.value = ''; emit('changed') }
}
</script>

<template>
  <div v-if="!info.vods.length" class="text-sm st-muted">Aucun live disponible pour l’instant : après ton prochain live, tu pourras choisir un passage ici.</div>
  <form v-else class="flex flex-col gap-3.5" @submit.prevent="send">
    <label class="flex flex-col gap-1.5">
      <span class="st-label">Quel live ?</span>
      <select v-model="vodId" class="st-field">
        <option v-for="v in info.vods" :key="v.id" :value="v.id">{{ vodLabel(v) }}</option>
      </select>
    </label>
    <div class="flex flex-wrap gap-3">
      <label class="flex min-w-[140px] flex-1 flex-col gap-1.5">
        <span class="st-label">Début dans le live</span>
        <input v-model="start" class="st-field" inputmode="numeric" placeholder="1:23:10" autocomplete="off">
      </label>
      <label class="flex min-w-[140px] flex-1 flex-col gap-1.5">
        <span class="st-label">Fin dans le live</span>
        <input v-model="end" class="st-field" inputmode="numeric" placeholder="1:30:52" autocomplete="off">
      </label>
    </div>
    <label class="flex flex-col gap-1.5">
      <span class="st-label">Titre de la vidéo YouTube (facultatif)</span>
      <input v-model="title" class="st-field" maxlength="100" placeholder="Sinon : le titre du live et l’heure de début">
    </label>
    <div class="st-hint" aria-live="polite">
      <template v-if="problem"><span class="font-semibold text-st-error">{{ problem }}</span></template>
      <template v-else-if="length">Durée du passage : <strong class="text-st-text">{{ length }}</strong>.</template>
      <template v-else>Regarde ton live sur Twitch, note l’heure de début et de fin du passage (la barre de lecture de la VOD les affiche).</template>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <button type="submit" class="st-btn" :disabled="!canSend">Ajouter la proposition</button>
      <span v-if="sent && !studio.error.value" class="text-sm font-semibold text-st-ok" role="status">Ajoutée : tu la retrouves dans « Propositions d’extraits ».</span>
    </div>
  </form>
</template>
