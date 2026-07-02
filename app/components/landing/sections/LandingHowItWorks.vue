<template>
  <section class="relative overflow-hidden rounded-3xl px-6 py-10 sm:px-10"> <!-- bg-clippeak-surface/40 -->
    <div class="absolute inset-0 bg-[linear-gradient(to_right,rgba(124,58,237,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(124,58,237,0.04)_1px,transparent_1px)] bg-[size:52px_52px]"></div>

    <div class="relative">
      <p class="text-center text-xs uppercase tracking-[0.26em] text-clippeak-violetLight/80">Comment ça marche</p>
      <h2 class="mt-4 text-center font-display text-4xl font-extrabold sm:text-5xl">
        3 étapes. <span class="text-clippeak-violetLight">C'est tout.</span>
      </h2>

      <div class="mt-10 grid gap-5 lg:grid-cols-3">
        <article class="relative rounded-2xl bg-clippeak-surface/30 p-6">
          <p class="absolute right-4 top-4 font-display text-6xl font-black text-clippeak-violet/15">01</p>
          <p class="text-xs font-bold uppercase tracking-wider text-clippeak-violetLight">Étape 01</p>
          <h3 class="mt-4 text-2xl font-extrabold leading-tight">Colle le lien de ta VOD</h3>
          <p class="mt-3 text-sm leading-6 text-clippeak-muted">
            Tu colles simplement l'URL Twitch de ton stream. Clippeak s'occupe du reste : aucun compte, aucun plugin, aucune config.
          </p>
          <p class="mt-4 text-sm font-semibold text-clippeak-violetLight/90">
            Aucune configuration. Aucun plugin.
          </p>
        </article>

        <article class="relative rounded-2xl bg-clippeak-surface/30 p-6">
          <p class="absolute right-4 top-4 font-display text-6xl font-black text-clippeak-violet/15">02</p>
          <p class="text-xs font-bold uppercase tracking-wider text-clippeak-violetLight">Étape 02</p>
          <h3 class="mt-4 text-2xl font-extrabold leading-tight">Clippeak analyse ton chat</h3>
          <p class="mt-3 text-sm leading-6 text-clippeak-muted">
            L'IA scanne les pics d'activité du chat, détecte les moments de hype et extrait automatiquement les séquences les plus fortes.
          </p>
          <p class="mt-4 text-sm font-semibold text-clippeak-violetLight/90">
            Chaque stream a son rythme — Clippeak s'y adapte.
          </p>
        </article>

        <article class="relative rounded-2xl bg-clippeak-surface/30 p-6">
          <p class="absolute right-4 top-4 font-display text-6xl font-black text-clippeak-violet/15">03</p>
          <p class="text-xs font-bold uppercase tracking-wider text-clippeak-violetLight">Étape 03</p>
          <h3 class="mt-4 text-2xl font-extrabold leading-tight">Télécharge et publie</h3>
          <p class="mt-3 text-sm leading-6 text-clippeak-muted">
            Tu reçois un ZIP de tes meilleurs moments, découpés et prêts à poster sur TikTok, Instagram Reels ou YouTube Shorts.
          </p>
          <p class="mt-4 text-sm font-semibold text-clippeak-violetLight/90">
            Tu publies. C'est tout.
          </p>
        </article>
      </div>
    </div>
  </section>
</template>
