<script setup lang="ts">
// Plafond mensuel (maquette « Message de quota ») : jamais une barrière brutale, et jamais une grande bannière d'abonnement.
//  - à 80 % : une simple ligne calme, avec un lien vers l'offre ;
//  - à 100 % : un bandeau fin (ce qui attend, ce qui reste disponible) avec « Passer à Creator » (ou « Ajouter un pack ») et l'invitation à parrainer.
// L'offre elle-même vit dans la boîte « ce mois-ci » de la colonne de gauche et dans l'écran « Mon offre ».
import { quotaLevel } from '~~/server/utils/clipping/quota'

const studio = useStudio()
const q = computed(() => studio.quota.value)
const b = computed(() => studio.billing.value)
const level = computed(() => q.value ? quotaLevel(q.value) : 'ok')
const creator = computed(() => b.value?.plan === 'creator')
const lives = computed(() => q.value?.unit === 'lives')
const resetDate = computed(() => {
  if (!q.value) return ''
  const d = new Date(q.value.resetsAt)
  return `${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${d.toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' })}`
})
const left = computed(() => q.value?.remaining ?? 0)
const waiting = computed(() => q.value?.waitingVods ?? 0)
const act = () => { if (creator.value) studio.openPortal(); else studio.view.value = 'offer' }
</script>

<template>
  <div v-if="q && level === 'near' && !lives" class="flex min-h-11 flex-wrap items-center gap-x-2.5 text-sm leading-[22px] st-muted" role="status" aria-label="Tu approches du plafond du mois">
    <span class="h-2 w-2 flex-none rounded-full bg-st-warn" aria-hidden="true" />
    <span>Plus que <strong class="font-extrabold text-st-text">{{ left }} clip{{ left > 1 ? 's' : '' }}</strong> ce mois-ci.</span>
    <button type="button" class="inline-flex min-h-11 items-center bg-transparent p-0 font-bold text-st-accentLight underline underline-offset-[3px]" @click="studio.view.value = 'offer'">Voir mon offre</button>
  </div>

  <section v-else-if="q && level === 'reached'" class="st-alert st-alert-warn st-rise flex-wrap items-center !gap-x-5 !gap-y-3" role="status" aria-label="Plafond du mois atteint">
    <div class="min-w-[240px] flex-1 text-sm leading-[22px]">
      <strong class="font-extrabold">Limite atteinte.</strong>
      <template v-if="lives"> Plus aucun nouveau live n’est pris en charge jusqu’au {{ resetDate }}.</template>
      <template v-else> Plus aucun nouveau clip jusqu’au {{ resetDate }}.</template>
      Tes clips déjà faits restent disponibles.<template v-if="waiting > 0"> {{ waiting }} live{{ waiting > 1 ? 's attendent' : ' attend' }}.</template>
    </div>
    <div v-if="b?.available" class="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <button type="button" class="st-btn !min-h-11" :disabled="studio.busy.value" @click="act">{{ creator ? 'Ajouter un pack' : 'Passer à Creator' }}</button>
      <button v-if="!creator" type="button" class="inline-flex min-h-11 items-center bg-transparent p-0 text-sm font-bold text-st-accentLight underline underline-offset-[3px]" @click="studio.view.value = 'referral'">Inviter un streamer pour gagner un live</button>
    </div>
  </section>
</template>
