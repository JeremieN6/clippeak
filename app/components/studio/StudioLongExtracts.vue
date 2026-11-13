<script setup lang="ts">
// Extraits longs pour YouTube : le streamer choisit un passage de son live (de 30 secondes a 10 minutes par defaut), Clippeak le coupe en
// 16:9, puis il passe par « A valider » comme un clip et se publie sur YouTube.
import { LONG_ABSOLUTE_MAX_SEC, LONG_MIN_SEC, formatClock, parseClock, validateLongRange } from '~~/server/utils/clipping/longExtract'

const studio = useStudio()
const info = ref<LongExtractsInfo | null>(null)
const open = ref(false)
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
    enabled.value = info.value.enabled
    maxSec.value = info.value.maxSec
    if (!vodId.value || !info.value.vods.some(v => v.id === vodId.value)) vodId.value = info.value.vods[0]?.id ?? ''
  } catch {
    info.value = null
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
  <section v-if="info" class="st-card flex flex-col gap-4 !p-5" aria-label="Extraits longs pour YouTube">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="m-0 text-base font-bold">Extraits longs pour YouTube</h2>
        <span class="st-badge" :class="info.enabled ? 'st-badge-ok' : 'st-badge-neutral'">{{ info.enabled ? 'Activé' : 'Désactivé' }}</span>
      </div>
      <button type="button" class="st-btn-ghost" :aria-expanded="open" @click="open = !open">{{ open ? 'Fermer' : 'Ouvrir' }}</button>
    </div>

    <template v-if="open">
      <p class="m-0 text-sm leading-relaxed st-muted">
        En plus des clips verticaux, tu peux publier sur YouTube un passage plus long de ton live (de {{ LONG_MIN_SEC }} secondes à {{ formatClock(maxSec) }}), au format horizontal 16:9.
        Tu choisis le début et la fin ; Clippeak le coupe, tu le vérifies, puis tu le publies.
      </p>

      <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label class="flex items-center gap-3 text-sm font-semibold">
          <StudioSwitch v-model="enabled" label="Activer les extraits longs" />
          Activer les extraits longs
        </label>
        <label class="flex items-center gap-2 text-sm font-semibold">
          Durée maximale
          <select v-model.number="maxSec" class="st-field !min-h-10 !w-auto" aria-label="Durée maximale d’un extrait">
            <option v-for="m in [180, 300, 600, LONG_ABSOLUTE_MAX_SEC]" :key="m" :value="m">{{ formatClock(m) }}</option>
          </select>
        </label>
        <button type="button" class="st-btn-ghost" :disabled="studio.busy.value" @click="save">Enregistrer</button>
      </div>

      <template v-if="info.enabled">
        <hr class="m-0 border-0 border-t border-st-border">
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
        <p class="m-0 text-[12px] leading-4 st-muted">
          Le live doit rester lisible sur Twitch (VOD publique) le temps de la coupe. Pour publier sur une chaîne secondaire (compte de marque), choisis-la quand Google te demande sur quelle chaîne connecter YouTube.
          Tant que Google n’a pas validé Clippeak, YouTube garde les vidéos en privé.
        </p>
      </template>
    </template>
  </section>
</template>
