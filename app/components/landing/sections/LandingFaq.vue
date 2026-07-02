<script setup lang="ts">
const faqOpen = ref<number | null>(0)

const faqs = [
  {
    q: 'Comment Clippeak sait quels moments clipper ?',
    a: "On analyse l'activité de ton chat en temps réel. Quand les messages explosent soudainement, c'est signe qu'il se passe quelque chose d'intéressant. On extrait automatiquement la séquence correspondante."
  },
  {
    q: 'Est-ce que Clippeak fonctionne sur YouTube ?',
    a: "Pour l'instant Clippeak est optimisé pour Twitch, dont on exploite le chat pour détecter les moments forts. YouTube sera supporté dans une version future."
  },
  {
    q: 'Combien de clips vais-je obtenir ?',
    a: "Ça dépend de l'activité de ton chat. En moyenne, un live de 3-4h génère entre 8 et 15 clips."
  },
  {
    q: 'Mes données sont-elles conservées ?',
    a: 'Non. Tes clips sont disponibles au téléchargement pendant 30 minutes après génération, puis tout est supprimé de nos serveurs.'
  },
  {
    q: 'C est gratuit ?',
    a: 'Oui, complètement gratuit pendant la période de beta.'
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
