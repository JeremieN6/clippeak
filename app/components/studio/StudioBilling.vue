<script setup lang="ts">
// Offre du streamer : Starter (gratuit) ou Creator (payant, par packs de 120 clips). Invisible tant que Stripe n'est pas configure sur le
// serveur. Annuel propose en premier quand son prix existe, avec l'economie par rapport a 12 mois au tarif mensuel.
// Le paiement et la gestion de l'abonnement se font chez Stripe : Clippeak ne voit jamais la carte.
const studio = useStudio()
const b = computed(() => studio.billing.value)

const yearly = computed(() => Boolean(b.value?.prices?.year))
const interval = ref<'month' | 'year'>('year')
const packs = ref(1)
const maxPacks = computed(() => b.value?.maxPacks ?? 5)
// Sans prix annuel, on reste sur le mensuel.
const chosen = computed<'month' | 'year'>(() => yearly.value ? interval.value : 'month')

const eur = (cents: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: (b.value?.prices?.month.currency ?? 'eur').toUpperCase(), minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100)
const monthlyTotal = computed(() => (b.value?.prices?.month.amount ?? 0) * packs.value)
const yearlyTotal = computed(() => (b.value?.prices?.year?.amount ?? 0) * packs.value)
const saved = computed(() => monthlyTotal.value * 12 - yearlyTotal.value)
const percent = computed(() => monthlyTotal.value ? Math.round(saved.value / (monthlyTotal.value * 12) * 100) : 0)
const clips = computed(() => (b.value?.paidClips ?? 120) * packs.value)

const renews = computed(() => b.value?.renewsAt ? new Date(b.value.renewsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
const pastDue = computed(() => b.value?.status === 'past_due')
const rhythm = computed(() => b.value?.interval === 'year' ? 'facturé chaque année' : b.value?.interval === 'month' ? 'facturé chaque mois' : '')
</script>

<template>
  <section v-if="b?.available" class="st-card flex flex-col gap-3" aria-label="Mon offre">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="st-title m-0 text-lg font-bold">Mon offre : {{ b.planName }}<template v-if="b.plan === 'creator' && (b.packs ?? 1) > 1"> ×{{ b.packs }}</template></h2>
      <span class="st-badge" :class="b.plan === 'creator' ? 'st-badge-ok' : 'st-badge-neutral'">{{ b.plan === 'creator' ? `${b.paidTotalClips ?? b.paidClips} clips par mois` : `Gratuit · ${b.freeClips} clips par mois` }}</span>
      <span v-if="b.testMode" class="st-badge st-badge-warn">Mode test : aucun vrai paiement</span>
    </div>

    <template v-if="b.plan === 'free'">
      <p class="m-0 text-sm leading-relaxed st-muted">Besoin de plus de place ? {{ b.paidName }} s’achète par packs de <strong class="text-white">{{ b.paidClips }} clips par mois</strong>. Sans engagement : tu peux l’annuler quand tu veux.</p>

      <div v-if="yearly" class="flex flex-wrap gap-2" role="radiogroup" aria-label="Rythme de facturation">
        <button type="button" role="radio" :aria-checked="chosen === 'year'" class="st-chip !h-11 !px-4 !text-sm" :class="chosen === 'year' ? '!bg-st-accent !text-white' : ''" @click="interval = 'year'">Annuel <span v-if="percent > 0" class="ml-1.5 text-xs font-bold">−{{ percent }} %</span></button>
        <button type="button" role="radio" :aria-checked="chosen === 'month'" class="st-chip !h-11 !px-4 !text-sm" :class="chosen === 'month' ? '!bg-st-accent !text-white' : ''" @click="interval = 'month'">Mensuel</button>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2" role="group" aria-label="Nombre de packs">
          <button type="button" class="st-btn-ghost !h-11 !w-11 !p-0" :disabled="packs <= 1" aria-label="Un pack de moins" @click="packs--">−</button>
          <span class="min-w-24 text-center text-sm font-bold" aria-live="polite">{{ packs }} pack{{ packs > 1 ? 's' : '' }} · {{ clips }} clips</span>
          <button type="button" class="st-btn-ghost !h-11 !w-11 !p-0" :disabled="packs >= maxPacks" aria-label="Un pack de plus" @click="packs++">+</button>
        </div>
      </div>

      <div class="flex flex-col gap-0.5">
        <template v-if="chosen === 'year'">
          <div class="text-2xl font-bold">{{ eur(Math.round(yearlyTotal / 12)) }}<span class="ml-1 text-sm font-semibold st-muted">par mois</span></div>
          <div class="text-[13px] st-muted">Facturé {{ eur(yearlyTotal) }} par an, au lieu de {{ eur(monthlyTotal * 12) }} ({{ eur(monthlyTotal) }} × 12) : tu économises {{ eur(saved) }}.</div>
        </template>
        <template v-else>
          <div class="text-2xl font-bold">{{ eur(monthlyTotal) }}<span class="ml-1 text-sm font-semibold st-muted">par mois</span></div>
          <div v-if="yearly" class="text-[13px] st-muted">En annuel : {{ eur(Math.round(yearlyTotal / 12)) }} par mois, soit {{ eur(saved) }} d’économie par an.</div>
        </template>
      </div>

      <div><button type="button" class="st-btn" :disabled="studio.busy.value" @click="studio.startCheckout({ interval: chosen, packs })">Passer à {{ b.paidName }}</button></div>
    </template>

    <template v-else>
      <p v-if="pastDue" class="st-alert st-alert-warn m-0" role="alert">Le dernier paiement n’a pas abouti. Mets à jour ta carte dans « Gérer mon abonnement » pour garder ton offre.</p>
      <p class="m-0 text-sm leading-relaxed st-muted">
        {{ pastDue ? 'Ton abonnement attend un paiement' : 'Ton abonnement est actif' }}<template v-if="rhythm"> ({{ rhythm }})</template><template v-if="renews"> · échéance : {{ renews }}</template>. Tu peux changer de carte, voir tes factures, changer le nombre de packs ou l’annuler depuis le portail sécurisé de Stripe.
      </p>
      <div><button type="button" class="st-btn-ghost" :disabled="studio.busy.value || !b.canManage" @click="studio.openPortal()">Gérer mon abonnement</button></div>
    </template>
  </section>
</template>
