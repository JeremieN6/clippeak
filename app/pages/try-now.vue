<script setup lang="ts">
import LandingNavbar from '../components/landing/sections/LandingNavbar.vue'
import LandingInteractiveFlow from '../components/landing/sections/LandingInteractiveFlow.vue'
import LandingFooter from '../components/landing/sections/LandingFooter.vue'

const navLinks = [
  { href: '/', label: 'Accueil' },
  { href: '/#features', label: 'Benefices' },
  { href: '/#how-it-works', label: 'Comment ça marche' },
  { href: '/#offers', label: 'Offres' },
  { href: '/#testimonials', label: 'Temoignages' },
  { href: '/#faq', label: 'FAQ' }
]
</script>

<template>
  <main class="mx-auto w-full max-w-6xl px-5 pb-14 pt-6 sm:px-8 sm:pt-8">
    <LandingNavbar :links="navLinks" primary-href="/try-now" />

    <section class="relative mb-10 mt-8 text-center">
      <div class="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-clippeak-violet/35 blur-[120px]"></div>
      <div class="relative">
        <!-- <h1 class="font-display text-4xl font-extrabold sm:text-5xl">
          Arrête de perdre tes meilleurs moments. <br> Commence à clipper intelligemment.
        </h1>

        <p class="mx-auto mt-4 max-w-2xl text-base text-clippeak-muted sm:text-lg">
          Tout est pensé pour publier plus vite, sans avoir à re-regarder 6h de VOD.
        </p> -->
      </div>
    </section>

    <LandingInteractiveFlow />

    <div class="mt-12">
      <LandingFooter />
    </div>
  </main>
</template>
