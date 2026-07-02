<template>
  <section class="grid items-center gap-10 rounded-3xl bg-clippeak-surface/40 p-6 backdrop-blur-sm lg:grid-cols-[1fr_1.1fr] lg:p-10">

    <!-- Colonne gauche : texte explicatif -->
    <article class="space-y-6">
      <p class="text-xs uppercase tracking-[0.26em] text-clippeak-violetLight/80">En un coup d'œil</p>
      <h2 class="font-display text-4xl font-extrabold leading-tight sm:text-5xl">
        Colle le lien,
        <span class="block text-clippeak-violetLight">reçois tes meilleurs clips.</span>
      </h2>
      <p class="text-base leading-7 text-clippeak-muted">
        Clippeak lit ta VOD Twitch, détecte chaque pic d'activité du chat, et te sort un ZIP prêt à poster — sans que tu aies à regarder une seule seconde de footage.
      </p>

      <ol class="space-y-4">
        <li class="flex items-start gap-4">
          <span class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clippeak-violet/25 text-xs font-bold text-clippeak-violetLight">1</span>
          <span class="text-sm leading-6 text-white/85">Tu colles ton lien Twitch. Rien d'autre.</span>
        </li>
        <li class="flex items-start gap-4">
          <span class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clippeak-violet/25 text-xs font-bold text-clippeak-violetLight">2</span>
          <span class="text-sm leading-6 text-white/85">Clippeak analyse le chat et extrait les moments forts automatiquement.</span>
        </li>
        <li class="flex items-start gap-4">
          <span class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clippeak-violet/25 text-xs font-bold text-clippeak-violetLight">3</span>
          <span class="text-sm leading-6 text-white/85">Tu télécharges un ZIP de clips optimisés pour TikTok, Reels et Shorts.</span>
        </li>
      </ol>

      <a href="/try-now" class="inline-flex items-center gap-2 rounded-xl bg-clippeak-violet px-5 py-3 text-sm font-semibold text-white transition hover:bg-clippeak-violetLight">
        Essayer gratuitement
        <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>
    </article>

    <!-- Colonne droite : mockup laptop -->
    <div class="relative flex justify-center" aria-hidden="true">
      <!-- Halo derriere le laptop -->
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="h-56 w-80 rounded-full bg-clippeak-violet/20 blur-[80px]"></div>
      </div>

      <!-- Laptop shell -->
      <div class="relative w-full max-w-md">
        <!-- Ecran -->
        <div class="overflow-hidden rounded-t-2xl border border-white/15 bg-[#0d0d18] shadow-2xl">

          <!-- Barre navigateur -->
          <div class="flex items-center gap-2 border-b border-white/10 bg-[#12121d] px-4 py-2.5">
            <span class="h-2.5 w-2.5 rounded-full bg-red-500/60"></span>
            <span class="h-2.5 w-2.5 rounded-full bg-yellow-400/60"></span>
            <span class="h-2.5 w-2.5 rounded-full bg-green-400/60"></span>
            <div class="ml-3 flex-1 rounded-md bg-white/5 px-3 py-1.5 text-xs text-white/30">
              clippeak.app/try-now
            </div>
          </div>

          <!-- Contenu de l app -->
          <div class="p-5 space-y-4">

            <!-- Input URL -->
            <div class="flex items-center gap-2 rounded-xl border border-clippeak-violet/40 bg-white/5 px-4 py-3">
              <svg class="h-4 w-4 shrink-0 text-clippeak-violetLight" viewBox="0 0 24 24" fill="none"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 10-5.656-5.656l-1.102 1.101" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              <span class="text-xs text-white/40">twitch.tv/streamer/v/2148937264</span>
            </div>

            <!-- Barre de progression -->
            <div class="rounded-xl border border-white/10 bg-white/5 p-4">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-semibold text-white/70">Analyse du chat</span>
                <span class="text-xs text-clippeak-violetLight">78%</span>
              </div>
              <div class="h-1.5 rounded-full bg-black/40">
                <div class="h-1.5 w-[78%] rounded-full bg-gradient-to-r from-clippeak-violet to-clippeak-violetLight"></div>
              </div>
              <p class="mt-2 text-[11px] text-white/30">Détection des pics d'activité du chat...</p>
            </div>

            <!-- Clips detectes -->
            <div class="space-y-2">
              <p class="text-[11px] uppercase tracking-wider text-white/40">Moments détectés</p>
              <div class="flex items-center justify-between rounded-lg border border-clippeak-violet/20 bg-clippeak-violet/10 px-3 py-2.5">
                <div>
                  <p class="text-xs font-semibold text-white">Clip #1 — 1h24m08s</p>
                  <p class="text-[11px] text-white/40">+347 msgs en 12 sec · hype max</p>
                </div>
                <span class="rounded-md bg-clippeak-violet/40 px-2 py-1 text-[10px] font-bold text-clippeak-violetLight">★ 9.4</span>
              </div>
              <div class="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div>
                  <p class="text-xs font-semibold text-white/70">Clip #2 — 2h03m51s</p>
                  <p class="text-[11px] text-white/30">+189 msgs en 9 sec</p>
                </div>
                <span class="rounded-md bg-white/10 px-2 py-1 text-[10px] font-bold text-white/50">★ 7.1</span>
              </div>
              <div class="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div>
                  <p class="text-xs font-semibold text-white/70">Clip #3 — 3h47m22s</p>
                  <p class="text-[11px] text-white/30">+214 msgs en 15 sec</p>
                </div>
                <span class="rounded-md bg-white/10 px-2 py-1 text-[10px] font-bold text-white/50">★ 8.0</span>
              </div>
            </div>

            <!-- Bouton download -->
            <button type="button" class="w-full rounded-xl bg-clippeak-violet py-2.5 text-xs font-semibold text-white">
              Télécharger le ZIP (3 clips · 5h42 analysée)
            </button>
          </div>
        </div>

        <!-- Socle laptop -->
        <div class="h-3 rounded-b-xl bg-[#1a1a2a] border-x border-b border-white/10"></div>
        <div class="mx-auto h-1.5 w-1/3 rounded-b-xl bg-[#222235]"></div>
      </div>
    </div>

  </section>
</template>
