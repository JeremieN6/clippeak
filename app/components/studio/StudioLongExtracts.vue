<script setup lang="ts">
// Reglage des extraits longs : activer, duree maximale et case « ma chaine YouTube est verifiee » (plus de 15 minutes).
import { LONG_MIN_SEC, LONG_UNVERIFIED_MAX_SEC, formatClock } from '~~/server/utils/clipping/longExtract'
import { commandsProblem, normalizeCommand } from '~~/server/utils/clipping/longMarkers'

const props = defineProps<{ info: LongExtractsInfo }>()
const emit = defineEmits<{ changed: [] }>()
const studio = useStudio()
const enabled = ref(props.info.enabled)
const maxSec = ref(props.info.maxSec)
const verified = ref(props.info.verified)
const startCommand = ref(props.info.startCommand)
const endCommand = ref(props.info.endCommand)
const modsAllowed = ref(props.info.modsAllowed)
watch(() => props.info, (i) => { enabled.value = i.enabled; maxSec.value = i.maxSec; verified.value = i.verified; startCommand.value = i.startCommand; endCommand.value = i.endCommand; modsAllowed.value = i.modsAllowed })
const commandsError = computed(() => commandsProblem(startCommand.value, endCommand.value))

// Durees proposees : jusqu'a 15 minutes, puis jusqu'a 60 minutes si le streamer confirme que sa chaine YouTube est verifiee.
const maxOptions = computed(() => verified.value ? [180, 300, 600, 900, 1800, 2700, 3600] : [180, 300, 600, 900])
watch(verified, (v) => { if (!v && maxSec.value > LONG_UNVERIFIED_MAX_SEC) maxSec.value = LONG_UNVERIFIED_MAX_SEC })
const dirty = computed(() => enabled.value !== props.info.enabled || maxSec.value !== props.info.maxSec || verified.value !== props.info.verified
  || normalizeCommand(startCommand.value) !== props.info.startCommand || normalizeCommand(endCommand.value) !== props.info.endCommand || modsAllowed.value !== props.info.modsAllowed)

async function save() {
  await studio.saveLongExtractSettings({ enabled: enabled.value, maxSec: maxSec.value, verified: verified.value, startCommand: startCommand.value, endCommand: endCommand.value, modsAllowed: modsAllowed.value })
  emit('changed')
}
</script>

<template>
  <section class="st-card flex flex-col gap-4 !p-5" aria-label="Réglage des extraits longs">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="st-title m-0 text-lg font-bold">Réglage</h2>
      <span class="st-badge" :class="info.enabled ? 'st-badge-ok' : 'st-badge-neutral'">{{ info.enabled ? 'Activé' : 'Désactivé' }}</span>
    </div>
    <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
      <label class="flex items-center gap-3 text-sm font-semibold">
        <StudioSwitch v-model="enabled" label="Activer les extraits longs" />
        Activer les extraits longs
      </label>
      <label class="flex items-center gap-2 text-sm font-semibold">
        Durée maximale
        <select v-model.number="maxSec" class="st-field !min-h-10 !w-auto" aria-label="Durée maximale d’un extrait long">
          <option v-for="m in maxOptions" :key="m" :value="m">{{ formatClock(m) }}</option>
        </select>
      </label>
      <button type="button" class="st-btn" :disabled="studio.busy.value || !dirty || !!commandsError" @click="save">Enregistrer</button>
    </div>
    <label class="flex items-start gap-3 text-sm font-semibold">
      <input v-model="verified" type="checkbox" class="m-0 mt-0.5 h-5 w-5 flex-none accent-st-accent">
      <span>Ma chaîne YouTube est vérifiée (plus de 15 minutes)<span class="mt-0.5 block text-[13px] font-normal st-muted">Pour publier plus de 15 minutes, YouTube demande de vérifier ton numéro de téléphone sur ta chaîne (gratuit, une seule fois). Les chaînes établies l’ont presque toujours fait. Si la tienne ne l’est pas, YouTube refusera la vidéo.</span></span>
    </label>
    <div id="long-commandes" class="flex scroll-mt-24 flex-col gap-3 rounded-xl border border-st-border bg-st-field p-4">
      <div class="text-sm font-bold">Commandes du chat</div>
      <p class="m-0 text-[13px] leading-5 st-muted">Pendant ton live, tape la première au début d’un bon passage et la seconde à la fin : Clippeak te le propose ensuite. Tu peux choisir tes propres mots (ils commencent par « ! »).</p>
      <div class="flex flex-wrap gap-3">
        <label class="flex min-w-[150px] flex-1 flex-col gap-1.5"><span class="st-label">Début</span><input id="long-cmd-start" v-model="startCommand" class="st-field" maxlength="21" autocomplete="off" spellcheck="false" placeholder="!extrait"></label>
        <label class="flex min-w-[150px] flex-1 flex-col gap-1.5"><span class="st-label">Fin</span><input v-model="endCommand" class="st-field" maxlength="21" autocomplete="off" spellcheck="false" placeholder="!fin"></label>
      </div>
      <label class="flex items-start gap-3 text-sm font-semibold">
        <input v-model="modsAllowed" type="checkbox" class="m-0 mt-0.5 h-5 w-5 flex-none accent-st-accent">
        <span>Mes modérateurs peuvent aussi les taper<span class="mt-0.5 block text-[13px] font-normal st-muted">Seul ton compte Twitch (celui avec lequel tu t’es connecté à Clippeak, même si tu changes de pseudo) est écouté, et tes modérateurs seulement si tu coches cette case. Les spectateurs sont ignorés, et un badge « streamer » ne suffit pas sans ton compte.</span></span>
      </label>
      <div v-if="commandsError" role="alert" class="text-[13px] font-semibold text-st-error">{{ commandsError }}</div>
    </div>
    <div class="st-hint">Un extrait long dure de {{ LONG_MIN_SEC / 60 }} minutes à {{ formatClock(maxSec) }}. Rien n’est créé tant que tu n’as pas activé et enregistré.</div>
  </section>
</template>
