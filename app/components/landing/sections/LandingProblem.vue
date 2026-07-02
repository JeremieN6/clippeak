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
          <p class="mt-4 text-xl font-bold text-white">Instantané</p>
          <p class="mt-3 text-sm leading-6 text-clippeak-muted">
            Tu colles ton lien, Clippeak fait le reste. Zéro scrub à la main sur 6h de VOD.
          </p>
        </article>

        <article class="rounded-2xl border border-clippeak-violet/25 bg-black/30 p-6">
          <h3 class="text-3xl">💬</h3>
          <p class="mt-4 text-xl font-bold text-white">Chat-driven</p>
          <p class="mt-3 text-sm leading-6 text-clippeak-muted">
            L'IA suit les pics de ton chat en temps réel. Quand ça explose, le moment est extrait.
          </p>
        </article>

        <article class="rounded-2xl border border-clippeak-violet/25 bg-black/30 p-6">
          <h3 class="text-3xl">✂️</h3>
          <p class="mt-4 text-xl font-bold text-white">Découpage propre</p>
          <p class="mt-3 text-sm leading-6 text-clippeak-muted">
            20 secondes avant, 5 secondes après: chaque clip a le bon timing pour accrocher l'audience.
          </p>
        </article>

        <article class="rounded-2xl border border-clippeak-violet/25 bg-black/30 p-6">
          <h3 class="text-3xl">📱</h3>
          <p class="mt-4 text-xl font-bold text-white">Prêt à poster</p>
          <p class="mt-3 text-sm leading-6 text-clippeak-muted">
            Un ZIP optimisé pour TikTok, Reels et Shorts. Tu publies sans rééditer.
          </p>
        </article>
      </div>
    </div>
  </section>
</template>
