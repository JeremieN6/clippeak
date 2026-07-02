<script setup lang="ts">
import LandingNavbar from '../components/landing/sections/LandingNavbar.vue'
import LandingHero from '../components/landing/sections/LandingHero.vue'
import LandingProblem from '../components/landing/sections/LandingProblem.vue'
import LandingHowItWorks from '../components/landing/sections/LandingHowItWorks.vue'
import LandingFeatures from '../components/landing/sections/LandingFeatures.vue'
import LandingInteractiveFlow from '../components/landing/sections/LandingInteractiveFlow.vue'
import LandingTestimonials from '../components/landing/sections/LandingTestimonials.vue'
import LandingFaq from '../components/landing/sections/LandingFaq.vue'
import LandingFeedbackWaitlist from '../components/landing/sections/LandingFeedbackWaitlist.vue'
import LandingFooter from '../components/landing/sections/LandingFooter.vue'

const sectionIds = {
  problem: 'problem',
  how: 'how-it-works',
  features: 'features',
  flow: 'try-now',
  testimonials: 'testimonials',
  faq: 'faq',
  feedback: 'feedback'
}

const navLinks = [
  { id: sectionIds.problem, label: 'Probleme' },
  { id: sectionIds.how, label: 'Etapes' },
  { id: sectionIds.features, label: 'Features' },
  { id: sectionIds.flow, label: 'Essai' },
  { id: sectionIds.testimonials, label: 'Avis' },
  { id: sectionIds.faq, label: 'FAQ' },
  { id: sectionIds.feedback, label: 'Feedback' }
]
</script>

<template>
  <main class="mx-auto w-full max-w-6xl px-5 pb-14 pt-6 sm:px-8 sm:pt-8">
    <LandingNavbar :links="navLinks" :primary-target-id="sectionIds.flow" />

    <LandingHero :primary-target-id="sectionIds.flow" />

    <section :id="sectionIds.problem" class="mt-14 scroll-mt-24">
      <LandingProblem />
    </section>

    <section :id="sectionIds.how" class="mt-14 scroll-mt-24">
      <LandingHowItWorks />
    </section>

    <section :id="sectionIds.features" class="mt-14 scroll-mt-24">
      <LandingFeatures />
    </section>

    <section :id="sectionIds.flow" class="mt-14 scroll-mt-24">
      <LandingInteractiveFlow />
    </section>

    <section :id="sectionIds.testimonials" class="mt-14 scroll-mt-24">
      <LandingTestimonials />
    </section>

    <section :id="sectionIds.faq" class="mt-14 scroll-mt-24">
      <LandingFaq />
    </section>

    <section :id="sectionIds.feedback" class="mt-14 scroll-mt-24">
      <LandingFeedbackWaitlist />
    </section>

    <div class="mt-12">
      <LandingFooter />
    </div>
  </main>
</template>
