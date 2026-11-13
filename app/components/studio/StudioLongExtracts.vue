<script setup lang="ts">
// Reglage des extraits longs (activer, duree maximale) et demande manuelle d'un passage de live : le streamer choisit un live, un debut et
// une fin ; Clippeak coupe en 16:9 et l'extrait arrive dans « A valider ». Affiche dans la page « Videos longues ».
import { LONG_ABSOLUTE_MAX_SEC, LONG_MIN_SEC, formatClock, parseClock, validateLongRange } from '~~/server/utils/clipping/longExtract'

const emit = defineEmits<{ loaded: [enabled: boolean] }>()
const studio = useStudio()
const info = ref<LongExtractsInfo | null>(null)
const failed = ref(false)
const enabled = ref(false)
const maxSec = ref(600)
const vodId = ref('')
const start = ref('')
const end = ref('')
const title = ref('')
const sent = ref(false)

async function load() {
  if (!studio.channelId.value) return
  try {
    info.value = await studio.loadLongExtracts()
    failed.value = false
    enabled.value = info.value.enabled
    maxSec.value = info.value.maxSec
    if (!vodId.value || !info.value.vods.some(v => v.id === vodId.value)) vodId.value = info.value.vods[0]?.id ?? ''
    emit('loaded', info.value.enabled)
  } catch {
    info.value = null
    failed.value = true
  }
}
onMounted(load)
watch(() => studio.channelId.value, load)

const vod = computed(() => info.value?.vods.find(v => v.id === vodId.value) ?? null)
const startSec = computed(() => parseClock(start.value))
const endSec = computed(() => parseClock(end.value))
const problem = computed(() => {
  if (startSec.value === null || endSec.value === null) return start.value || end.value ? 'Écris le début et la fin comme 1:23:45 (heures, minutes, secondes) ou 23:45.' : ''
  return validateLongRange({ startSec: startSec.value, endSec: endSec.value, maxSec: maxSec.value, vodDurationSec: vod.value?.durationSec })
})
const length = computed(() => startSec.value !== null && endSec.value !== null && endSec.value > startSec.value ? formatClock(endSec.value - startSec.value) : '')
const canSend = computed(() => !!vod.value && startSec.value !== null && endSec.value !== null && !problem.value && !studio.busy.value)
const dirty = computed(() => !!info.value && (enabled.value !== info.value.enabled || maxSec.value !== info.value.maxSec))

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
const vodLabel = (v: LongExtractVod) => `${v.title || 'Live sans titre'} · ${fmtDate(v.startedAt)}${v.durationSec ? ` · ${formatClock(v.durationSec)}` : ''}`

async function save() {
  await studio.saveLongExtractSettings(enabled.value, maxSec.value)
  await load()
}
async function send() {
  if (!canSend.value || !vod.value || startSec.value === null || endSec.value === null) return
  sent.value = false
  await studio.requestLongExtract({ vodId: vod.value.id, startSec: startSec.value, endSec: endSec.value, title: title.value.trim() || undefined })
  if (!studio.error.value) { sent.value = true; start.value = ''; end.value = ''; title.value = '' }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <section class="st-card flex flex-col gap-4 !p-5" aria-label="Réglage des vidéos longues">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="st-title m-0 text-lg font-bold">Réglage</h2>
        <span v-if="info" class="st-badge" :class="info.enabled ? 'st-badge-ok' : 'st-badge-neutral'">{{ info.enabled ? 'Activé' : 'Désactivé' }}</span>
      </div>
      <p v-if="failed" class="st-alert st-alert-error m-0" role="alert">Impossible de charger ce réglage pour le moment. Recharge la page (Ctrl+F5) ; si ça continue, écris à contact.clippeak@sassify.fr.</p>
      <template v-else-if="info">
        <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label class="flex items-center gap-3 text-sm font-semibold">
            <StudioSwitch v-model="enabled" label="Activer les vidéos longues" />
            Activer les vidéos longues
          </label>
          <label class="flex items-center gap-2 text-sm font-semibold">
            Durée maximale
            <select v-model.number="maxSec" class="st-field !min-h-10 !w-auto" aria-label="Durée maximale d’une vidéo longue">
              <option v-for="m in [180, 300, 600, LONG_ABSOLUTE_MAX_SEC]" :key="m" :value="m">{{ formatClock(m) }}</option>
            </select>
          </label>
          <button type="button" class="st-btn" :disabled="studio.busy.value || !dirty" @click="save">Enregistrer</button>
        </div>
        <div class="st-hint">Une vidéo longue dure de {{ LONG_MIN_SEC }} secondes à {{ formatClock(maxSec) }}. Rien n’est créé tant que tu n’as pas activé et enregistré.</div>
      </template>
    </section>

    <section v-if="info?.enabled" class="st-card flex flex-col gap-4 !p-5" aria-label="Préparer un extrait">
      <h2 class="st-title m-0 text-lg font-bold">Préparer un extrait</h2>
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
            <input v-model="start" class="st-field" inputmode="numeric" placeholder="1:23:45" autocomplete="off">
          </label>
          <label class="flex min-w-[140px] flex-1 flex-col gap-1.5">
            <span class="st-label">Fin dans le live</span>
            <input v-model="end" class="st-field" inputmode="numeric" placeholder="1:31:10" autocomplete="off">
          </label>
        </div>
        <label class="flex flex-col gap-1.5">
          <span class="st-label">Titre de la vidéo YouTube (facultatif)</span>
          <input v-model="title" class="st-field" maxlength="100" placeholder="Sinon : le titre du live et l’heure de début">
        </label>
        <div class="st-hint" aria-live="polite">
          <template v-if="problem"><span class="font-semibold text-st-error">{{ problem }}</span></template>
          <template v-else-if="length">Durée de l’extrait : <strong class="text-st-text">{{ length }}</strong>.</template>
          <template v-else>Regarde ton live sur Twitch, note l’heure de début et de fin du passage (la barre de lecture de la VOD les affiche).</template>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <button type="submit" class="st-btn" :disabled="!canSend">Préparer l’extrait</button>
          <span v-if="sent && !studio.error.value" class="text-sm font-semibold text-st-ok" role="status">C’est parti : l’extrait arrive bientôt dans « À valider ».</span>
        </div>
      </form>
      <p class="m-0 text-[12px] leading-4 st-muted">Le live doit rester lisible sur Twitch (VOD publique) le temps de la coupe.</p>
    </section>
  </div>
</template>
