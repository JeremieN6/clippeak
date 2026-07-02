<script setup lang="ts">
import LandingNavbar from '../components/landing/sections/LandingNavbar.vue'
import LandingHero from '../components/landing/sections/LandingHero.vue'
import LandingVisual from '../components/landing/sections/LandingVisual.vue'
import LandingProblem from '../components/landing/sections/LandingProblem.vue'
import LandingHowItWorks from '../components/landing/sections/LandingHowItWorks.vue'
import LandingFeatures from '../components/landing/sections/LandingFeatures.vue'
import LandingOffers from '../components/landing/sections/LandingOffers.vue'
import LandingTestimonials from '../components/landing/sections/LandingTestimonials.vue'
import LandingFaq from '../components/landing/sections/LandingFaq.vue'
import LandingFinalCta from '../components/landing/sections/LandingFinalCta.vue'
import LandingFooter from '../components/landing/sections/LandingFooter.vue'

const sectionIds = {
  visual: 'visual',
  problem: 'problem',
  how: 'how-it-works',
  features: 'features',
  offers: 'offers',
  testimonials: 'testimonials',
  faq: 'faq',
  cta: 'cta-final'
}

const navLinks = [
      { href: '/try-now', label: 'Try now' },
  { href: `#${sectionIds.features}`, label: 'Benefices' },
  { href: `#${sectionIds.how}`, label: 'Comment ça marche' },
  { href: `#${sectionIds.offers}`, label: 'Offres' },
  { href: `#${sectionIds.testimonials}`, label: 'Temoignages' },
  { href: `#${sectionIds.faq}`, label: 'FAQ' },
]
</script>

<template>
  <main class="mx-auto w-full max-w-7xl px-5 pb-14 pt-6 sm:px-8 sm:pt-8">
    <LandingNavbar :links="navLinks" primary-href="/try-now" />

    <LandingHero primary-href="/try-now" />

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

    <section :id="sectionIds.testimonials" class="mt-14 scroll-mt-24">
      <LandingTestimonials />
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
