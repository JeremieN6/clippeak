<template>
  <section class="rounded-3xl px-6 py-10 sm:px-10"> <!-- bg-clippeak-surface/40  -->
    <p class="text-center text-xs uppercase tracking-[0.26em] text-clippeak-violetLight/80">Tarifs</p>
    <h2 class="mt-4 text-center font-display text-4xl font-extrabold sm:text-5xl">
      Simple pendant la beta,
      <span class="text-clippeak-violetLight">évolue ensuite.</span>
    </h2>
    <p class="mt-3 text-center text-base text-clippeak-muted">Accès gratuit pendant la période de test, sur invitation. Passe à l'offre payante quand tu as besoin de plus de clips.</p>

    <div class="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2">
      <article class="rounded-3xl bg-black/20 p-8">
        <div class="flex items-center justify-between gap-3">
          <p class="text-lg font-bold uppercase tracking-[0.12em] text-white/70">Starter</p>
          <span class="rounded-full bg-clippeak-violet/20 px-3 py-1 text-xs font-semibold text-clippeak-violetLight">Bêta gratuite</span>
        </div>

        <p class="mt-6 font-display text-5xl font-bold">0€<span class="ml-2 text-2xl text-clippeak-muted">/mois</span></p>
        <p class="mt-2 text-sm text-clippeak-muted">Pendant toute la période bêta.</p>

        <ul class="mt-6 space-y-3 text-sm text-white/85">
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> 40 clips par mois</li>
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

        <p class="mt-6 font-display text-5xl font-bold text-white">19€<span class="ml-2 text-2xl text-white/60">/mois</span></p>
        <p class="mt-2 text-sm text-white/70">Pour les streameurs qui publient souvent.</p>
        <p class="mt-1 text-xs text-white/60">TVA non applicable, art. 293 B du CGI</p>

        <ul class="mt-6 space-y-3 text-sm text-white/90">
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> 120 clips par mois (au lieu de 40)</li>
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> Tout ce qui est dans Starter</li>
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> Résiliable à tout moment</li>
        </ul>

        <button type="button" disabled class="mt-8 w-full rounded-2xl bg-clippeak-violet px-5 py-3 text-sm font-semibold text-white opacity-60">
          Bientôt disponible
        </button>
      </article>
    </div>
  </section>
</template>
