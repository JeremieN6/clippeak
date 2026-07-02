<template>
  <section class="rounded-3xl px-6 py-10 sm:px-10"> <!-- bg-clippeak-surface/40  -->
    <p class="text-center text-xs uppercase tracking-[0.26em] text-clippeak-violetLight/80">Tarifs</p>
    <h2 class="mt-4 text-center font-display text-4xl font-extrabold sm:text-5xl">
      Simple pendant la beta,
      <span class="text-clippeak-violetLight">évolue ensuite.</span>
    </h2>
    <p class="mt-3 text-center text-base text-clippeak-muted">Accès gratuit pendant la période de test. Upgrade quand tu scales.</p>

    <div class="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2">
      <article class="rounded-3xl bg-black/20 p-8">
        <div class="flex items-center justify-between gap-3">
          <p class="text-lg font-bold uppercase tracking-[0.12em] text-white/70">Starter</p>
          <span class="rounded-full bg-clippeak-violet/20 px-3 py-1 text-xs font-semibold text-clippeak-violetLight">Bêta gratuite</span>
        </div>

        <p class="mt-6 font-display text-5xl font-bold">0€<span class="ml-2 text-2xl text-clippeak-muted">/mois</span></p>
        <p class="mt-2 text-sm text-clippeak-muted">Pendant toute la période bêta.</p>

        <ul class="mt-6 space-y-3 text-sm text-white/85">
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> 10 VOD traitées / mois</li>
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> Détection automatique par chat</li>
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> Export ZIP instantané</li>
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> Aucun compte requis</li>
        </ul>

        <a href="/try-now" class="mt-8 block w-full rounded-2xl bg-clippeak-violet px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-clippeak-violetLight">
          Essayer maintenant
        </a>
      </article>

      <article class="rounded-3xl bg-gradient-to-b from-clippeak-violet/25 to-black/20 p-8 shadow-glow">
        <div class="flex items-center justify-between gap-3">
          <p class="text-lg font-bold uppercase tracking-[0.12em] text-white">Creator</p>
          <span class="rounded-full bg-clippeak-violet/30 px-3 py-1 text-xs font-semibold text-clippeak-violetLight">Bientôt disponible</span>
        </div>

        <p class="mt-6 font-display text-5xl font-bold text-white">19€<span class="ml-2 text-2xl text-white/60">/mois</span></p>
        <p class="mt-2 text-sm text-white/70">Pour les streameurs qui publient tous les jours.</p>

        <ul class="mt-6 space-y-3 text-sm text-white/90">
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> VOD illimitées</li>
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> Traitement prioritaire</li>
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> Envoi automatique après le live</li>
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> Lancement d'un clip par commande vocal pendant le live</li>
          <li class="flex items-center gap-2"><span class="text-clippeak-violetLight">✓</span> Discord / Telegram / Mail</li>
        </ul>

        <button type="button" disabled class="mt-8 w-full rounded-2xl bg-clippeak-violet px-5 py-3 text-sm font-semibold text-white opacity-60">
          Rejoindre la liste d'attente
        </button>
      </article>
    </div>
  </section>
</template>
