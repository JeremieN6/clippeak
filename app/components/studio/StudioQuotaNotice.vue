<script setup lang="ts">
// Plafond mensuel de clips : un message clair, jamais une barriere brutale.
//  - a 80 % : message court (« il t'en reste X ») avec un lien vers l'offre ;
//  - a 100 % : combien de clips obtenus, ce qui attend (les lives sont en pause jusqu'a la remise a zero), et le bouton Creator, annuel en premier.
// Le bouton lance directement la page de paiement ; sans Stripe configure (offre indisponible) on garde seulement le message.
import { quotaLevel } from '~~/server/utils/clipping/quota'

const studio = useStudio()
const q = computed(() => studio.quota.value)
const b = computed(() => studio.billing.value)
const level = computed(() => q.value ? quotaLevel(q.value) : 'ok')
const creator = computed(() => b.value?.plan === 'creator')
const canBuy = computed(() => Boolean(b.value?.available) && !creator.value)

const resetDate = computed(() => {
  if (!q.value) return ''
  const d = new Date(q.value.resetsAt)
  return `${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${d.toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' })}`
})
const eur = (cents: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: (b.value?.prices?.month.currency ?? 'eur').toUpperCase(), minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100)
// Annuel en premier quand son prix existe : « 12 € par mois, facturé 144 € par an ».
const yearly = computed(() => b.value?.prices?.year ?? null)
const interval = computed<'month' | 'year'>(() => yearly.value ? 'year' : 'month')
const priceLine = computed(() => {
  if (yearly.value) return `${eur(Math.round(yearly.value.amount / 12))} par mois, facturé ${eur(yearly.value.amount)} par an`
  return b.value?.prices ? `${eur(b.value.prices.month.amount)} par mois` : ''
})
const left = computed(() => q.value?.remaining ?? 0)
const waiting = computed(() => q.value?.waitingVods ?? 0)

const buy = () => studio.startCheckout({ interval: interval.value, packs: 1 })
const seeOffers = () => document.getElementById('mon-offre')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
</script>

<template>
  <section v-if="q && level === 'reached'" class="st-alert st-alert-warn st-rise !flex-col !items-start !gap-3" role="status" aria-label="Plafond du mois atteint">
    <div>
      <div class="text-[15px] font-extrabold">Tu as obtenu tes {{ q.used }} clips du mois</div>
      <p class="m-0 mt-1 text-sm leading-[21px] opacity-90">
        Tes clips restent disponibles ici, tu peux les valider, les télécharger et les publier.
        <template v-if="waiting > 0">{{ waiting }} live{{ waiting > 1 ? 's attendent' : ' attend' }} le {{ resetDate }}.</template>
        <template v-else>Tes prochains lives sont mis en pause jusqu’au {{ resetDate }} : rien n’est perdu, l’analyse reprend toute seule.</template>
        <template v-if="canBuy"> Pour continuer tout de suite, passe à Creator : {{ b?.paidClips ?? 120 }} clips par mois, et tes lives en pause repartent aussitôt.</template>
        <template v-else-if="creator"> Tu as utilisé tout ton plan : ajoute un pack depuis « Gérer mon abonnement » pour reprendre tout de suite.</template>
        <template v-else> Besoin de plus de place ? Écris à contact.clippeak@sassify.fr.</template>
      </p>
    </div>
    <div v-if="canBuy" class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button type="button" class="st-btn" :disabled="studio.busy.value" @click="buy">Passer à Creator<template v-if="priceLine"> : {{ priceLine }}</template></button>
      <button type="button" class="st-btn-quiet" @click="seeOffers">Voir les offres</button>
    </div>
    <div v-else-if="creator && b?.canManage"><button type="button" class="st-btn" :disabled="studio.busy.value" @click="studio.openPortal()">Gérer mon abonnement</button></div>
  </section>

  <section v-else-if="q && level === 'near'" class="st-alert st-alert-info st-rise flex-wrap items-center" role="status" aria-label="Tu approches du plafond du mois">
    <div class="min-w-[220px] flex-1 text-sm leading-[21px]">
      <strong class="font-extrabold">Plus que {{ left }} clip{{ left > 1 ? 's' : '' }} ce mois-ci</strong> ({{ q.used }} sur {{ q.limit }}). Ensuite tes lives attendent le {{ resetDate }}.
    </div>
    <button v-if="canBuy" type="button" class="st-btn-ghost" @click="seeOffers">Voir Creator</button>
  </section>
</template>
