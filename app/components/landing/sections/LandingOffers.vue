<script setup lang="ts">
// Tarifs : annuel affiche par defaut (le moins cher), mensuel en un clic. Valeurs dans server/utils/clipping/pricing.ts (a garder identiques
// aux prix Stripe). Sans TVA (franchise en base).
import { CLIPS_PER_PACK, CREATOR_PRICE, FREE_CLIPS, MAX_PACKS, yearlySaving } from '~~/server/utils/clipping/pricing'

const yearly = ref(true)
const saving = yearlySaving(CREATOR_PRICE.monthly, CREATOR_PRICE.yearly)
const eur = (n: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n)} €`
const maxClips = CLIPS_PER_PACK * MAX_PACKS
</script>

<template>
  <section class="rounded-3xl px-6 py-10 sm:px-10">
    <p class="text-center text-xs uppercase tracking-[0.26em] text-clippeak-violetLight/80">Tarifs</p>
    <h2 class="mt-4 text-center font-display text-4xl font-extrabold sm:text-5xl">
      Tu paies des clips,
      <span class="text-clippeak-violetLight">pas des heures de live.</span>
    </h2>
    <p class="mt-3 text-center text-base text-clippeak-muted">Accès gratuit pendant la bêta, sur invitation. Passe à l'offre payante quand tu as besoin de plus de clips.</p>

    <div class="mt-8 flex justify-center">
      <div class="inline-flex rounded-2xl border border-white/10 bg-black/30 p-1" role="radiogroup" aria-label="Rythme de facturation">
        <button type="button" role="radio" :aria-checked="yearly" class="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold transition" :class="yearly ? 'bg-clippeak-violet text-white' : 'text-white/70 hover:text-white'" @click="yearly = true">
          Annuel <span class="rounded-full bg-white/15 px-2 py-0.5 text-xs font-bold">−{{ saving.percent }} %</span>
        </button>
        <button type="button" role="radio" :aria-checked="!yearly" class="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold transition" :class="!yearly ? 'bg-clippeak-violet text-white' : 'text-white/70 hover:text-white'" @click="yearly = false">
          Mensuel
        </button>
      </div>
    </div>

    <div class="mx-auto mt-8 grid max-w-4xl gap-6 md:grid-cols-2">
      <article class="rounded-3xl bg-black/20 p-8">
        <div class="flex items-center justify-between gap-3">
          <p class="text-lg font-bold uppercase tracking-[0.12em] text-white/70">Starter</p>
          <span class="rounded-full bg-clippeak-violet/20 px-3 py-1 text-xs font-semibold text-clippeak-violetLight">Bêta gratuite</span>
        </div>

        <p class="mt-6 font-display text-5xl font-bold">0€<span class="ml-2 text-2xl text-clippeak-muted">/mois</span></p>
        <p class="mt-2 text-sm text-clippeak-muted">Pendant toute la période bêta.</p>

        <ul class="mt-6 space-y-3 text-sm text-white/85">
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> {{ FREE_CLIPS }} clips par mois</li>
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> Aucun filigrane</li>
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> Détection par chat et montage vertical</li>
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> Validation par lots de 4 clips</li>
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> Téléchargement des clips validés</li>
        </ul>

        <a href="/connexion" class="mt-8 block w-full rounded-2xl bg-clippeak-violet px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-clippeak-violetLight">
          Se connecter avec Twitch
        </a>
      </article>

      <article class="rounded-3xl bg-gradient-to-b from-clippeak-violet/25 to-black/20 p-8 shadow-glow">
        <div class="flex items-center justify-between gap-3">
          <p class="text-lg font-bold uppercase tracking-[0.12em] text-white">Creator</p>
          <span class="rounded-full bg-clippeak-violet/30 px-3 py-1 text-xs font-semibold text-clippeak-violetLight">Bientôt disponible</span>
        </div>

        <p class="mt-6 font-display text-5xl font-bold text-white">
          {{ eur(yearly ? saving.perMonth : CREATOR_PRICE.monthly) }}<span class="ml-2 text-2xl text-white/60">/mois</span>
        </p>
        <p v-if="yearly" class="mt-2 text-sm text-white/80">
          Facturé {{ eur(CREATOR_PRICE.yearly) }} par an, au lieu de <span class="line-through">{{ eur(saving.fullYear) }}</span> ({{ eur(CREATOR_PRICE.monthly) }} × 12) :
          <strong class="text-white">tu économises {{ eur(saving.saved) }}</strong>.
        </p>
        <p v-else class="mt-2 text-sm text-white/80">
          Facturé chaque mois, sans engagement. En annuel : {{ eur(saving.perMonth) }}/mois, soit {{ eur(saving.saved) }} d'économie par an.
        </p>

        <ul class="mt-6 space-y-3 text-sm text-white/90">
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> {{ CLIPS_PER_PACK }} clips par mois (au lieu de {{ FREE_CLIPS }})</li>
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> Plus de clips ? Jusqu'à {{ MAX_PACKS }} packs ({{ maxClips }} clips), au même prix par pack</li>
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> Tout ce qui est dans Starter</li>
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> Résiliable à tout moment</li>
        </ul>

        <button type="button" disabled class="mt-8 w-full rounded-2xl bg-clippeak-violet px-5 py-3 text-sm font-semibold text-white opacity-60">
          Bientôt disponible
        </button>
      </article>
    </div>

    <p class="mx-auto mt-6 max-w-2xl text-center text-xs text-clippeak-muted">Prix en euros, sans TVA (TVA non applicable, art. 293 B du CGI). Tu paies le nombre de clips produits, pas la durée de tes lives.</p>
  </section>
</template>
