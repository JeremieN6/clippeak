<template>
  <section class="relative overflow-hidden rounded-3xl px-6 py-10 sm:px-10"> <!-- bg-clippeak-surface/40 -->
    <div class="absolute inset-0 bg-[linear-gradient(to_right,rgba(124,58,237,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(124,58,237,0.04)_1px,transparent_1px)] bg-[size:52px_52px]"></div>
    <div class="absolute left-1/2 top-0 h-64 w-96 -translate-x-1/2 rounded-full bg-clippeak-violet/20 blur-[100px]"></div>

    <div class="relative">
      <p class="text-center text-xs uppercase tracking-[0.26em] text-clippeak-violetLight/80">Pourquoi Clippeak</p>
      <h2 class="mt-4 text-center font-display text-4xl font-extrabold leading-tight sm:text-5xl">
        Tout ce dont tu as besoin
        <span class="block text-clippeak-violetLight">pour ne plus rater un moment fort.</span>
      </h2>

      <div class="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article class="rounded-2xl border border-clippeak-violet/25 bg-black/30 p-6">
          <h3 class="text-3xl">⚡</h3>
          <p class="mt-4 text-xl font-bold text-white">Gain de temps</p>
          <p class="mt-3 text-sm leading-6 text-clippeak-muted">
            Clippeak fait le tri à ta place. Zéro scrub à la main sur 6h de VOD.
          </p>
        </article>

        <article class="rounded-2xl border border-clippeak-violet/25 bg-black/30 p-6">
          <h3 class="text-3xl">💬</h3>
          <p class="mt-4 text-xl font-bold text-white">Chat-driven</p>
          <p class="mt-3 text-sm leading-6 text-clippeak-muted">
            Clippeak suit les pics de ton chat. Quand ça explose, le moment est repéré et monté.
          </p>
        </article>

        <article class="rounded-2xl border border-clippeak-violet/25 bg-black/30 p-6">
          <h3 class="text-3xl">✂️</h3>
          <p class="mt-4 text-xl font-bold text-white">Découpage propre</p>
          <p class="mt-3 text-sm leading-6 text-clippeak-muted">
            Chaque clip commence sur une phrase et finit après la chute, pour accrocher l'audience.
          </p>
        </article>

        <article class="rounded-2xl border border-clippeak-violet/25 bg-black/30 p-6">
          <h3 class="text-3xl">📱</h3>
          <p class="mt-4 text-xl font-bold text-white">Prêt à valider</p>
          <p class="mt-3 text-sm leading-6 text-clippeak-muted">
            Format vertical avec titre et sous-titres. Tu valides, tu publies sans rééditer.
          </p>
        </article>
      </div>
    </div>
  </section>
</template>
