<script setup lang="ts">
// Écran « Mon offre » (Gratuit) / « Mon abonnement » (Creator) : maquette « Mon offre · Mon abonnement ».
// Gratuit : on choisit le rythme et le nombre de packs puis on paie chez Stripe. Abonnement actif : on voit l'état, et le nombre de packs
// ou la carte se changent dans le portail sécurisé de Stripe (Clippeak ne voit jamais la carte).
const studio = useStudio()
const b = computed(() => studio.billing.value)
const q = computed(() => studio.quota.value)
const back = () => { studio.view.value = studio.onboarding.value?.completed || studio.clips.value.length ? 'dashboard' : 'onboarding' }

const active = computed(() => b.value?.plan === 'creator')
const yearlyAvailable = computed(() => Boolean(b.value?.prices?.year))
const interval = ref<'month' | 'year'>('year')
const chosen = computed<'month' | 'year'>(() => yearlyAvailable.value ? interval.value : 'month')
const maxPacks = computed(() => b.value?.maxPacks ?? 5)
const perPack = computed(() => b.value?.paidClips ?? 120)
const currentPacks = computed(() => b.value?.packs ?? 1)
const packs = ref(1)
watch(() => b.value?.packs, (v) => { if (active.value && v) packs.value = v }, { immediate: true })

const eur = (cents: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: (b.value?.prices?.month.currency ?? 'eur').toUpperCase(), minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100)
const monthlyTotal = computed(() => (b.value?.prices?.month.amount ?? 0) * packs.value)
const yearlyTotal = computed(() => (b.value?.prices?.year?.amount ?? 0) * packs.value)
const saved = computed(() => monthlyTotal.value * 12 - yearlyTotal.value)
const percent = computed(() => monthlyTotal.value ? Math.round(saved.value / (monthlyTotal.value * 12) * 100) : 0)
const clips = computed(() => perPack.value * packs.value)
const packsLabel = (n: number) => `${n} pack${n > 1 ? 's' : ''}`
const showAnnual = computed(() => active.value ? b.value?.interval === 'year' : chosen.value === 'year')
const priceMain = computed(() => showAnnual.value ? eur(Math.round(yearlyTotal.value / 12)) : eur(monthlyTotal.value))
const unchanged = computed(() => active.value && packs.value === currentPacks.value)

const renews = computed(() => b.value?.renewsAt ? new Date(b.value.renewsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
const resets = computed(() => q.value ? new Date(q.value.resetsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(/^1 /, '1er ') : '')
const pastDue = computed(() => b.value?.status === 'past_due')
const usePct = computed(() => q.value && q.value.limit ? Math.min(100, Math.round(q.value.used / Math.max(1, q.value.limit) * 100)) : 0)
const useLabel = computed(() => q.value?.unit === 'lives' ? 'Lives ce mois-ci' : 'Clips ce mois-ci')

const submit = () => {
  if (active.value) studio.openPortal()
  else studio.startCheckout({ interval: chosen.value, packs: packs.value })
}
</script>

<template>
  <main class="mx-auto flex w-full max-w-[960px] flex-col gap-6 px-4 pb-16 pt-2 sm:px-10 sm:pt-8">
    <button type="button" class="inline-flex min-h-11 items-center gap-1.5 self-start border-0 bg-transparent p-0 text-sm font-bold text-st-accentLight" @click="back">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
      Tableau de bord
    </button>
    <header class="flex flex-col gap-2">
      <h1 class="st-title m-0 text-[26px] font-extrabold leading-8 sm:text-[30px] sm:leading-9">{{ active ? 'Mon abonnement' : 'Mon offre' }}</h1>
      <p class="m-0 max-w-[640px] text-[15px] leading-6 text-st-soft">{{ active ? 'Ton abonnement Creator et la façon de le gérer.' : 'Ton offre actuelle, et ce que Creator t’apporte en plus.' }}</p>
    </header>

    <div v-if="!b?.available" class="st-alert st-alert-info" role="status">Les offres ne sont pas disponibles pour le moment.</div>

    <template v-else>
      <p v-if="b.testMode" class="st-badge st-badge-warn self-start">Mode test : aucun vrai paiement</p>
      <p v-if="pastDue" class="st-alert st-alert-warn m-0" role="alert">Le dernier paiement n’a pas abouti. Mets à jour ta carte dans « Gérer mon abonnement » pour garder ton offre.</p>

      <!-- Offre actuelle -->
      <section aria-labelledby="oa-t" class="flex flex-col gap-4 rounded-2xl border bg-st-surface p-[18px] sm:p-7" :class="active ? 'border-st-okBorder' : 'border-st-border'">
        <span class="inline-flex h-[26px] items-center gap-1.5 self-start rounded-full px-2.5 text-xs font-extrabold" :class="active ? 'bg-st-okBg text-st-ok' : 'bg-st-raised2 text-st-text'"><span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{{ active ? 'Abonnement actif' : 'Offre actuelle' }}</span>
        <div class="flex flex-col gap-1">
          <h2 id="oa-t" class="st-title m-0 text-2xl font-extrabold leading-[30px]">{{ active ? `Creator · ${packsLabel(currentPacks)}` : 'Gratuit' }}</h2>
          <div class="text-[15px] leading-6 text-st-soft">{{ active ? `${(b.paidTotalClips ?? perPack * currentPacks)} clips par mois. Extraits longs inclus.` : `${b.freeLives ?? 2} lives par mois découpés en entier. Extraits longs non inclus.` }}</div>
        </div>
        <div v-if="q && q.limit !== null" class="flex flex-col gap-2">
          <div class="flex justify-between gap-2 text-sm"><span class="font-bold">{{ useLabel }}</span><span class="st-muted"><strong class="font-extrabold text-st-text">{{ q.used }}</strong> / {{ q.limit }}</span></div>
          <div class="h-2 overflow-hidden rounded bg-st-raised2" role="progressbar" :aria-label="useLabel" aria-valuemin="0" :aria-valuemax="q.limit" :aria-valuenow="q.used"><div class="st-bar h-full" :style="{ width: `${usePct}%` }" /></div>
        </div>
        <div class="text-sm leading-[22px] st-muted">
          <template v-if="active">Abonnement {{ pastDue ? 'en attente de paiement' : 'actif' }}<template v-if="renews">, renouvelé le {{ renews }}</template>.</template>
          <template v-else-if="resets">Se renouvelle le {{ resets }}.</template>
        </div>
        <div v-if="active" class="flex flex-col gap-3 border-t border-st-border pt-4">
          <button type="button" class="st-btn-ghost !min-h-[52px] gap-2.5 sm:self-start" :disabled="studio.busy.value || !b.canManage" @click="studio.openPortal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /></svg>Gérer mon abonnement
          </button>
          <div class="text-[13px] leading-5 text-st-dim">Tu y changes ta carte, tu retrouves tes factures et tu peux résilier.</div>
        </div>
      </section>

      <!-- Choisir / changer les packs -->
      <section aria-labelledby="cr-t" class="flex flex-col gap-5 rounded-2xl border border-st-accentBorder p-[18px] sm:p-7" style="background: linear-gradient(180deg, #1E1640 0%, var(--st-surface) 100%)">
        <div class="flex flex-col gap-1.5">
          <h2 id="cr-t" class="st-title m-0 text-[22px] font-extrabold leading-7">{{ active ? 'Changer le nombre de packs' : 'Passer à Creator' }}</h2>
          <div class="text-sm leading-[22px] text-st-soft">{{ active ? `Un pack, c’est ${perPack} clips par mois. Choisis de 1 à ${maxPacks} packs.` : `Par packs de ${perPack} clips par mois, de 1 à ${maxPacks} packs. Extraits longs inclus.` }}</div>
        </div>

        <div v-if="!active && yearlyAvailable" role="radiogroup" aria-label="Rythme de facturation" class="flex w-full rounded-full border border-st-border bg-st-bg p-1 sm:w-[340px]">
          <button type="button" role="radio" :aria-checked="chosen === 'year'" class="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border-0 px-4 text-[15px] font-bold" :class="chosen === 'year' ? 'bg-st-accent text-white' : 'bg-transparent text-st-soft'" @click="interval = 'year'">Annuel <span v-if="percent > 0" class="inline-flex h-6 items-center rounded-full px-2 text-xs font-extrabold text-[#EDE5FF]" :class="chosen === 'year' ? 'bg-[#3B2A6E]' : 'bg-st-border'">−{{ percent }} %</span></button>
          <button type="button" role="radio" :aria-checked="chosen === 'month'" class="inline-flex h-12 flex-1 items-center justify-center rounded-full border-0 px-5 text-[15px] font-bold" :class="chosen === 'month' ? 'bg-st-accent text-white' : 'bg-transparent text-st-soft'" @click="interval = 'month'">Mensuel</button>
        </div>

        <div class="flex flex-col gap-1.5">
          <div class="flex flex-wrap items-baseline justify-between gap-2.5"><label for="pk" class="text-[15px] font-bold">Nombre de packs</label><span class="text-sm text-st-soft"><strong class="font-extrabold text-st-text">{{ clips }} clips par mois</strong> · {{ packsLabel(packs) }}</span></div>
          <input id="pk" v-model.number="packs" type="range" min="1" :max="maxPacks" step="1" class="m-0 h-11 w-full cursor-pointer accent-[#7C3AED]" :aria-valuetext="`${packsLabel(packs)}, ${clips} clips par mois`">
          <div class="flex justify-between text-xs font-bold text-st-dim" aria-hidden="true"><span v-for="n in maxPacks" :key="n">{{ perPack * n }}</span></div>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex flex-wrap items-baseline gap-2"><span class="st-title text-[44px] font-extrabold leading-none sm:text-[52px]" aria-live="polite">{{ priceMain }}</span><span class="text-lg font-bold text-st-soft">/mois</span></div>
          <div class="text-sm leading-[22px] text-st-soft">
            <template v-if="showAnnual">Facturé {{ eur(yearlyTotal) }} par an ({{ eur(b.prices?.year?.amount ?? 0) }} par pack).</template>
            <template v-else>Facturé chaque mois ({{ eur(b.prices?.month.amount ?? 0) }} par pack).<template v-if="yearlyAvailable"> En annuel : {{ eur(Math.round(yearlyTotal / 12)) }} par mois.<template v-if="active"> Pour passer en annuel, ouvre « Gérer mon abonnement » : tu peux aussi y changer de pack en même temps.</template></template></template>
          </div>
          <div v-if="showAnnual && saved > 0" class="inline-flex min-h-8 items-center gap-2 self-start rounded-full bg-st-okBg px-3 py-1 text-sm font-extrabold leading-5 text-st-ok"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Tu économises {{ eur(saved) }} par an</div>
        </div>

        <ul class="m-0 flex list-none flex-col gap-2.5 p-0 text-[15px] leading-[22px]">
          <li class="flex items-start gap-2.5"><span class="font-extrabold text-st-accentLight" aria-hidden="true">✓</span><span><strong class="font-extrabold">{{ clips }} clips par mois</strong></span></li>
          <li class="flex items-start gap-2.5"><span class="font-extrabold text-st-accentLight" aria-hidden="true">✓</span><span>Extraits longs inclus</span></li>
        </ul>

        <div class="flex flex-col gap-2.5">
          <button type="button" class="st-btn !min-h-14 !rounded-[14px] !text-base sm:self-start" :disabled="studio.busy.value || unchanged || (active && !b.canManage)" @click="submit">{{ active ? (unchanged ? 'Aucun changement' : 'Mettre à jour mon abonnement') : 'Continuer vers le paiement' }}</button>
          <div class="text-[13px] leading-5 text-st-dim">{{ active ? (unchanged ? 'Déplace le curseur pour changer le nombre de packs, ou ouvre « Gérer mon abonnement » pour changer de rythme.' : 'Tu confirmeras sur la page sécurisée de Stripe, avec le détail avant de valider.') : 'Tu paies sur une page sécurisée. Tu pourras gérer ou résilier ton abonnement ensuite.' }}</div>
        </div>
      </section>

      <section v-if="!active" class="flex flex-wrap items-center justify-between gap-3.5 rounded-2xl border border-st-border bg-st-surface p-[18px] sm:p-7">
        <div class="flex min-w-0 flex-[1_1_260px] flex-col gap-1"><div class="text-base font-extrabold">Gagne des lives sans payer</div><div class="text-sm leading-[22px] st-muted">Invite un autre streamer : quand son premier clip est prêt, tu gagnes 1 live de plus ce mois-ci.</div></div>
        <button type="button" class="st-btn-ghost !min-h-12 w-full sm:w-auto" @click="studio.view.value = 'referral'">Voir le parrainage</button>
      </section>
    </template>
  </main>
</template>
