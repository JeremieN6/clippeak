<script setup lang="ts">
// Tarifs : annuel affiche par defaut (le moins cher), mensuel en un clic. Valeurs dans server/utils/clipping/pricing.ts (a garder identiques
// aux prix Stripe). Sans TVA (franchise en base).
import { CLIPS_PER_PACK, CREATOR_PRICE, FREE_CLIPS, MAX_PACKS, yearlySaving } from '~~/server/utils/clipping/pricing'

const yearly = ref(true)
const packs = ref(1)
const saving = yearlySaving(CREATOR_PRICE.monthly, CREATOR_PRICE.yearly)
const eur = (n: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n)} €`

// Curseur de packs : meme prix par pack, donc tout se multiplie par le nombre de packs.
const clips = computed(() => CLIPS_PER_PACK * packs.value)
const perMonth = computed(() => (yearly.value ? saving.perMonth : CREATOR_PRICE.monthly) * packs.value)
const yearTotal = computed(() => CREATOR_PRICE.yearly * packs.value)
const fullYear = computed(() => saving.fullYear * packs.value)
const saved = computed(() => saving.saved * packs.value)
const fill = computed(() => `${(packs.value - 1) / (MAX_PACKS - 1) * 100}%`)

const starterItems = computed(() => [`${FREE_CLIPS} clips par mois`, 'Aucun filigrane', 'Détection par chat et montage vertical', 'Validation par lots de 4 clips', 'Téléchargement des clips validés'])
const creatorItems = ['Tout ce qui est dans Starter', 'Résiliable à tout moment']
// Meme formule des deux cotes : incluse dans Creator, absente de Starter.
const longLine = 'Extraits longs en 16:9 publiés sur YouTube'
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
          <span class="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#12302A] px-3 text-[13px] font-extrabold text-[#6EDDB8]"><span class="h-1.5 w-1.5 rounded-full bg-[#6EDDB8]" aria-hidden="true" />Bêta gratuite</span>
        </div>

        <p class="mt-6 font-display text-5xl font-bold">0€<span class="ml-2 text-2xl text-clippeak-muted">/mois</span></p>
        <p class="mt-2 text-sm text-clippeak-muted">Pendant toute la période bêta.</p>

        <ul class="mt-6 flex flex-col gap-3.5 text-[15px] leading-[22px] text-white/90">
          <li v-for="item in starterItems" :key="item" class="flex items-start gap-3">
            <span class="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[#2A1F4A] text-[#C9B2FF]"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
            <span>{{ item }}</span>
          </li>
          <!-- Argument de l'offre payante : les extraits longs ne sont pas dans le gratuit (reserve cote serveur). -->
          <li class="flex items-start gap-3 text-white/50">
            <span class="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[#2C2837] text-[#928BA2]"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></span>
            <span>{{ longLine }} <span class="sr-only">(non inclus)</span></span>
          </li>
        </ul>

        <a href="/connexion" class="mt-8 block w-full rounded-2xl bg-clippeak-violet px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-clippeak-violetLight">
          Se connecter avec Twitch
        </a>
      </article>

      <article class="rounded-3xl bg-gradient-to-b from-clippeak-violet/25 to-black/20 p-8 shadow-glow">
        <div class="flex items-center justify-between gap-3">
          <p class="text-lg font-bold uppercase tracking-[0.12em] text-white">Creator</p>
          <span class="inline-flex h-7 items-center whitespace-nowrap rounded-full bg-[#33280F] px-3 text-[13px] font-extrabold text-[#F6C260]">Bientôt disponible</span>
        </div>

        <div class="mt-6">
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span class="font-semibold text-white" aria-live="polite">{{ clips }} clips par mois</span>
            <span class="text-white/60">{{ packs }} pack{{ packs > 1 ? 's' : '' }} de {{ CLIPS_PER_PACK }}</span>
          </div>
          <input v-model.number="packs" type="range" min="1" :max="MAX_PACKS" step="1" class="pack-range mt-3 w-full" :style="{ '--fill': fill }" aria-label="Nombre de clips par mois" :aria-valuetext="`${clips} clips par mois`">
          <div class="mt-2 flex justify-between text-[11px] text-white/50" aria-hidden="true">
            <span v-for="n in MAX_PACKS" :key="n" :class="n === packs ? 'font-bold text-white' : ''">{{ n * CLIPS_PER_PACK }}</span>
          </div>
        </div>

        <p class="mt-5 font-display text-5xl font-bold text-white">
          {{ eur(perMonth) }}<span class="ml-2 text-2xl text-white/60">/mois</span>
        </p>
        <p v-if="yearly" class="mt-2 text-sm text-white/80">
          Facturé {{ eur(yearTotal) }} par an, au lieu de <span class="line-through">{{ eur(fullYear) }}</span> ({{ eur(CREATOR_PRICE.monthly * packs) }} × 12).
        </p>
        <p v-else class="mt-2 text-sm text-white/80">Facturé chaque mois, sans engagement.</p>
        <!-- Economie en vert : acquise en annuel, proposee en mensuel (meme montant). -->
        <p class="mt-3 inline-flex min-h-[30px] items-center rounded-full bg-[#12302A] px-3 py-1 text-[13px] font-extrabold text-[#6EDDB8]">
          {{ yearly ? `Tu économises ${eur(saved)} par an` : `En annuel, tu économiserais ${eur(saved)} par an` }}
        </p>

        <ul class="mt-6 flex flex-col gap-3.5 text-[15px] leading-[22px] text-white/90">
          <li class="flex items-start gap-3">
            <span class="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[#3B2A6E] text-[#E4D9FF]"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
            <span><strong class="font-extrabold">{{ clips }} clips par mois</strong> (au lieu de {{ FREE_CLIPS }})</span>
          </li>
          <li class="flex items-start gap-3">
            <span class="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[#3B2A6E] text-[#E4D9FF]"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
            <span><strong class="font-extrabold">Extraits longs</strong> en 16:9, publiés sur ta chaîne YouTube</span>
          </li>
          <li v-for="item in creatorItems" :key="item" class="flex items-start gap-3">
            <span class="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[#3B2A6E] text-[#E4D9FF]"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
            <span>{{ item }}</span>
          </li>
        </ul>

        <button type="button" disabled class="mt-8 w-full rounded-2xl bg-clippeak-violet px-5 py-3 text-sm font-semibold text-white opacity-60">
          Bientôt disponible
        </button>
      </article>
    </div>

    <p class="mx-auto mt-6 max-w-2xl text-center text-xs text-clippeak-muted">Prix en euros, sans TVA (TVA non applicable, art. 293 B du CGI). Tu paies le nombre de clips produits, pas la durée de tes lives.</p>
  </section>
</template>

<style scoped>
/* Curseur de packs : une barre de progression violette jusqu'au pouce (--fill), pouce blanc de 24 px (zone de toucher confortable). */
.pack-range { -webkit-appearance: none; appearance: none; height: 8px; border-radius: 999px; cursor: pointer; background: linear-gradient(to right, #9f67ff var(--fill), rgba(255, 255, 255, 0.18) var(--fill)); }
.pack-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 24px; height: 24px; border-radius: 50%; background: #fff; border: 3px solid #7c3aed; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4); }
.pack-range::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 3px solid #7c3aed; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4); }
.pack-range::-moz-range-track { height: 8px; border-radius: 999px; background: transparent; }
.pack-range:focus-visible { outline: 2px solid #b9a0ff; outline-offset: 6px; }
</style>
