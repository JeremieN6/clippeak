<script setup lang="ts">
import LandingNavbar from '../components/landing/sections/LandingNavbar.vue'
import LandingHero from '../components/landing/sections/LandingHero.vue'
import LandingVisual from '../components/landing/sections/LandingVisual.vue'
import LandingProblem from '../components/landing/sections/LandingProblem.vue'
import LandingHowItWorks from '../components/landing/sections/LandingHowItWorks.vue'
import LandingFeatures from '../components/landing/sections/LandingFeatures.vue'
import LandingOffers from '../components/landing/sections/LandingOffers.vue'
import LandingFaq from '../components/landing/sections/LandingFaq.vue'
import LandingFinalCta from '../components/landing/sections/LandingFinalCta.vue'
import LandingFooter from '../components/landing/sections/LandingFooter.vue'

const sectionIds = {
  visual: 'visual',
  problem: 'problem',
  how: 'how-it-works',
  features: 'features',
  offers: 'offers',
  faq: 'faq',
  cta: 'cta-final'
}

const navLinks = [
  { href: '/try-now', label: 'Voir la démo' },
  { href: `#${sectionIds.features}`, label: 'Bénéfices' },
  { href: `#${sectionIds.how}`, label: 'Comment ça marche' },
  { href: `#${sectionIds.offers}`, label: 'Offres' },
  { href: `#${sectionIds.faq}`, label: 'FAQ' }
]

useSeoMeta({
  title: 'Clippeak : tes meilleurs moments Twitch, en clips verticaux',
  description: 'Clippeak repère les pics de réaction de ton chat Twitch et prépare des clips verticaux avec titre et sous-titres. Tu valides, puis tu publies. Bêta sur invitation.',
  ogTitle: 'Clippeak : tes meilleurs moments Twitch, en clips verticaux',
  ogDescription: 'Des clips verticaux prêts à valider, tirés de tes lives Twitch. Bêta sur invitation, gratuite jusqu’à 40 clips par mois.',
  ogType: 'website',
  twitterCard: 'summary'
})
</script>

<template>
  <main class="mx-auto w-full max-w-7xl px-5 pb-14 pt-6 sm:px-8 sm:pt-8">
    <LandingNavbar :links="navLinks" primary-href="/connexion" />

    <LandingHero primary-href="/connexion" secondary-href="/try-now" />

    <section :id="sectionIds.visual" class="mt-12 scroll-mt-24">
      <LandingVisual />
    </section>

    <!-- <section :id="sectionIds.logos" class="mt-12 scroll-mt-24">
      <LandingClientLogos />
    </section> -->

    <section :id="sectionIds.problem" class="mt-14 scroll-mt-24">
      <LandingProblem />
    </section>

    <section :id="sectionIds.how" class="mt-14 scroll-mt-24">
      <LandingHowItWorks />
    </section>

    <section :id="sectionIds.features" class="mt-14 scroll-mt-24">
      <LandingFeatures />
    </section>

    <section :id="sectionIds.offers" class="mt-14 scroll-mt-24">
      <LandingOffers />
    </section>

    <section :id="sectionIds.faq" class="mt-14 scroll-mt-24">
      <LandingFaq />
    </section>

    <section :id="sectionIds.cta" class="mt-14 scroll-mt-24">
      <LandingFinalCta />
    </section>

    <div class="mt-12">
      <LandingFooter />
    </div>
  </main>
</template>
