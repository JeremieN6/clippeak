<script setup lang="ts">
// Offre du streamer : Starter (gratuit) ou Creator (payant). Invisible tant que Stripe n'est pas configure sur le serveur.
// Le paiement et la gestion de l'abonnement se font chez Stripe : Clippeak ne voit jamais la carte.
const studio = useStudio()
const b = computed(() => studio.billing.value)

const money = computed(() => {
  const p = b.value?.price
  if (!p) return ''
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: p.currency.toUpperCase(), minimumFractionDigits: p.amount % 100 === 0 ? 0 : 2 }).format(p.amount / 100)
})
const renews = computed(() => b.value?.renewsAt ? new Date(b.value.renewsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
const pastDue = computed(() => b.value?.status === 'past_due')
</script>

<template>
  <section v-if="b?.available" class="st-card flex flex-col gap-3" aria-label="Mon offre">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="st-title m-0 text-lg font-bold">Mon offre : {{ b.planName }}</h2>
      <span class="st-badge" :class="b.plan === 'creator' ? 'st-badge-ok' : 'st-badge-neutral'">{{ b.plan === 'creator' ? `${b.paidClips} clips par mois` : `Gratuit · ${b.freeClips} clips par mois` }}</span>
      <span v-if="b.testMode" class="st-badge st-badge-warn">Mode test : aucun vrai paiement</span>
    </div>

    <template v-if="b.plan === 'free'">
      <p class="m-0 text-sm leading-relaxed st-muted">
        Besoin de plus de place ? L’offre {{ b.paidName }} passe à <strong class="text-white">{{ b.paidClips }} clips par mois</strong> pour {{ money }}{{ b.price.interval === 'month' ? ' par mois' : '' }}. Sans engagement : tu peux l’annuler quand tu veux.
      </p>
      <div><button type="button" class="st-btn" :disabled="studio.busy.value" @click="studio.startCheckout()">Passer à {{ b.paidName }}</button></div>
    </template>

    <template v-else>
      <p v-if="pastDue" class="st-alert st-alert-warn m-0" role="alert">Le dernier paiement n’a pas abouti. Mets à jour ta carte dans « Gérer mon abonnement » pour garder ton offre.</p>
      <p class="m-0 text-sm leading-relaxed st-muted">
        {{ pastDue ? 'Ton abonnement attend un paiement' : 'Ton abonnement est actif' }}<template v-if="renews"> (échéance : {{ renews }})</template>. Tu peux changer de carte, voir tes factures ou l’annuler depuis le portail sécurisé de Stripe.
      </p>
      <div><button type="button" class="st-btn-ghost" :disabled="studio.busy.value || !b.canManage" @click="studio.openPortal()">Gérer mon abonnement</button></div>
    </template>
  </section>
</template>
