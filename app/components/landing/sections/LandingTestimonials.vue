<script setup lang="ts">
const testimonials = [
  {
    quote: "J'ai récupéré 12 clips de mon dernier live en moins de 2 minutes. J'aurais mis des heures à faire ça manuellement.",
    name: 'Kevin',
    handle: '@kevplay_fr',
    role: 'streamer Twitch',
    avatar: 'https://i.pravatar.cc/80?img=12'
  },
  {
    quote: "Le clip qui a le plus buzzé sur mon TikTok ce mois-ci, c'est Clippeak qui l'a détecté. Je ne l'aurais jamais trouvé seul.",
    name: 'Manon',
    handle: '@manongaming',
    role: 'streamer Twitch',
    avatar: 'https://i.pravatar.cc/80?img=32'
  },
  {
    quote: "Enfin un outil qui comprend que les streameurs n'ont pas le temps de tout regarder après un live.",
    name: 'Thomas',
    handle: '@tomstreamz',
    role: 'streamer Twitch',
    avatar: 'https://i.pravatar.cc/80?img=68'
  }
]
</script>

<template>
  <section class="relative overflow-hidden rounded-3xl px-6 py-10 sm:px-10"> <!-- bg-clippeak-surface/40 -->
    <div class="absolute inset-0 bg-[linear-gradient(to_right,rgba(124,58,237,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(124,58,237,0.04)_1px,transparent_1px)] bg-[size:52px_52px]"></div>

    <div class="relative">
      <p class="text-center text-xs uppercase tracking-[0.26em] text-clippeak-violetLight/80">Témoignages</p>
      <h2 class="mt-4 text-center font-display text-4xl font-extrabold sm:text-5xl">Ce que les streameurs en disent</h2>

      <div class="mt-10 grid gap-4 md:grid-cols-3">
        <article v-for="item in testimonials" :key="item.handle" class="card-surface p-5">
          <div class="mb-3 flex items-center gap-3">
            <img :src="item.avatar" :alt="`Avatar de ${item.name}`" class="h-10 w-10 rounded-full object-cover">
            <div>
              <p class="font-semibold">{{ item.name }}</p>
              <p class="text-xs text-clippeak-muted">{{ item.role }} {{ item.handle }}</p>
            </div>
          </div>

          <p class="text-sm text-white/90">"{{ item.quote }}"</p>
        </article>
      </div>

      <p class="mt-4 text-center text-xs text-clippeak-muted">Témoignages bêta testeurs</p>
    </div>
  </section>
</template>
