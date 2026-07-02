<template>
  <section class="relative overflow-hidden rounded-3xl px-6 py-10 sm:px-10"> <!-- bg-clippeak-surface/40 -->
    <div class="absolute inset-0 bg-[linear-gradient(to_right,rgba(124,58,237,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(124,58,237,0.04)_1px,transparent_1px)] bg-[size:52px_52px]"></div>

    <div class="relative">
      <p class="text-center text-xs uppercase tracking-[0.26em] text-clippeak-violetLight/80">Fonctionnalités</p>
      <h2 class="mt-4 text-center font-display text-4xl font-extrabold leading-tight sm:text-5xl">
        Tout ce dont tu as besoin
        <span class="block text-clippeak-violetLight">pour clipper sans effort.</span>
      </h2>

      <div class="mt-10 grid gap-4 md:grid-cols-2">
      <article class="rounded-2xl border border-clippeak-violet/25 bg-black/30 p-6">
        <h3 class="font-semibold">Détection par pic de chat</h3>
        <p class="mt-2 text-sm text-clippeak-muted">Quand ton chat explose, Clippeak le détecte et extrait la séquence automatiquement.</p>
      </article>

      <article class="rounded-2xl border border-clippeak-violet/25 bg-black/30 p-6">
        <h3 class="font-semibold">Découpage intelligent</h3>
        <p class="mt-2 text-sm text-clippeak-muted">On coupe 20 secondes avant le pic et 5 secondes après le calme pour ne rien rater.</p>
      </article>

      <article class="rounded-2xl border border-clippeak-violet/25 bg-black/30 p-6">
        <h3 class="font-semibold">Clips multi-parts</h3>
        <p class="mt-2 text-sm text-clippeak-muted">Si un moment est trop long, il est découpé automatiquement en parts numérotées.</p>
      </article>

      <article class="rounded-2xl border border-clippeak-violet/25 bg-black/30 p-6">
        <h3 class="font-semibold">ZIP prêt à publier</h3>
        <p class="mt-2 text-sm text-clippeak-muted">Tu reçois tous tes clips dans un ZIP optimisé pour TikTok et Reels.</p>
      </article>
      </div>
    </div>
  </section>
</template>
