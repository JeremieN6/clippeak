<script setup lang="ts">
// Reglage des extraits longs : activer, duree maximale et case « ma chaine YouTube est verifiee » (plus de 15 minutes).
import { LONG_MIN_SEC, LONG_UNVERIFIED_MAX_SEC, formatClock } from '~~/server/utils/clipping/longExtract'

const props = defineProps<{ info: LongExtractsInfo }>()
const emit = defineEmits<{ changed: [] }>()
const studio = useStudio()
const enabled = ref(props.info.enabled)
const maxSec = ref(props.info.maxSec)
const verified = ref(props.info.verified)
watch(() => props.info, (i) => { enabled.value = i.enabled; maxSec.value = i.maxSec; verified.value = i.verified })

// Durees proposees : jusqu'a 15 minutes, puis jusqu'a 60 minutes si le streamer confirme que sa chaine YouTube est verifiee.
const maxOptions = computed(() => verified.value ? [180, 300, 600, 900, 1800, 2700, 3600] : [180, 300, 600, 900])
watch(verified, (v) => { if (!v && maxSec.value > LONG_UNVERIFIED_MAX_SEC) maxSec.value = LONG_UNVERIFIED_MAX_SEC })
const dirty = computed(() => enabled.value !== props.info.enabled || maxSec.value !== props.info.maxSec || verified.value !== props.info.verified)

async function save() {
  await studio.saveLongExtractSettings(enabled.value, maxSec.value, verified.value)
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
      <button type="button" class="st-btn" :disabled="studio.busy.value || !dirty" @click="save">Enregistrer</button>
    </div>
    <label class="flex items-start gap-3 text-sm font-semibold">
      <input v-model="verified" type="checkbox" class="m-0 mt-0.5 h-5 w-5 flex-none accent-st-accent">
      <span>Ma chaîne YouTube est vérifiée (plus de 15 minutes)<span class="mt-0.5 block text-[13px] font-normal st-muted">Pour publier plus de 15 minutes, YouTube demande de vérifier ton numéro de téléphone sur ta chaîne (gratuit, une seule fois). Les chaînes établies l’ont presque toujours fait. Si la tienne ne l’est pas, YouTube refusera la vidéo.</span></span>
    </label>
    <div class="st-hint">Un extrait long dure de {{ LONG_MIN_SEC / 60 }} minutes à {{ formatClock(maxSec) }}. Rien n’est créé tant que tu n’as pas activé et enregistré.</div>
  </section>
</template>
