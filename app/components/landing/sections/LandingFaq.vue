<script setup lang="ts">
const faqOpen = ref<number | null>(0)

const faqs = [
  {
    q: 'Comment Clippeak sait quels moments clipper ?',
    a: "On analyse l'activite de ton chat en temps reel. Quand les messages explosent soudainement, c'est signe qu'il se passe quelque chose d'interessant. On extrait automatiquement la sequence correspondante."
  },
  {
    q: 'Est-ce que Clippeak fonctionne sur YouTube ?',
    a: "Pour l'instant Clippeak est optimise pour Twitch, dont on exploite le chat pour detecter les moments forts. YouTube sera supporte dans une version future."
  },
  {
    q: 'Combien de clips vais-je obtenir ?',
    a: "Ca depend de l'activite de ton chat. En moyenne, un live de 3-4h genere entre 8 et 15 clips."
  },
  {
    q: 'Mes donnees sont-elles conservees ?',
    a: 'Non. Tes clips sont disponibles au telechargement pendant 30 minutes apres generation, puis tout est supprime de nos serveurs.'
  },
  {
    q: 'C est gratuit ?',
    a: 'Oui, completement gratuit pendant la periode de beta.'
  }
]

function toggleFaq(index: number) {
  faqOpen.value = faqOpen.value === index ? null : index
}
</script>

<template>
  <section>
    <h2 class="font-display text-3xl font-extrabold sm:text-4xl">Questions frequentes</h2>

    <div class="mt-6 space-y-3">
      <article v-for="(item, index) in faqs" :key="item.q" class="card-surface">
        <button class="flex w-full items-center justify-between px-5 py-4 text-left" @click="toggleFaq(index)">
          <span class="font-semibold">{{ item.q }}</span>
          <span class="text-clippeak-violetLight">{{ faqOpen === index ? '−' : '+' }}</span>
        </button>
        <div v-if="faqOpen === index" class="px-5 pb-4 text-sm text-clippeak-muted">
          {{ item.a }}
        </div>
      </article>
    </div>
  </section>
</template>
