<script setup lang="ts">
const testimonials = [
  {
    quote: "J'ai recupere 12 clips de mon dernier live en moins de 2 minutes. J'aurais mis des heures a faire ca manuellement.",
    name: 'Kevin',
    handle: '@kevplay_fr',
    role: 'streamer Twitch',
    avatar: 'https://i.pravatar.cc/80?img=12'
  },
  {
    quote: "Le clip qui a le plus buzze sur mon TikTok ce mois-ci, c'est Clippeak qui l'a detecte. Je l'aurais jamais trouve seul.",
    name: 'Manon',
    handle: '@manongaming',
    role: 'streamer Twitch',
    avatar: 'https://i.pravatar.cc/80?img=32'
  },
  {
    quote: "Enfin un outil qui comprend que les streameurs n'ont pas le temps de tout regarder apres un live.",
    name: 'Thomas',
    handle: '@tomstreamz',
    role: 'streamer Twitch',
    avatar: 'https://i.pravatar.cc/80?img=68'
  }
]
</script>

<template>
  <section>
    <h2 class="font-display text-3xl font-extrabold sm:text-4xl">Ce que les streameurs en disent</h2>

    <div class="mt-6 grid gap-4 md:grid-cols-3">
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

    <p class="mt-3 text-xs text-clippeak-muted">Temoignages beta testeurs</p>
  </section>
</template>
