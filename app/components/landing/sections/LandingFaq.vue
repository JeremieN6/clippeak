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
    q: 'C’est gratuit ?',
    a: 'Oui, complètement gratuit pendant la période de bêta.'
  }
]

function toggleFaq(index: number) {
  faqOpen.value = faqOpen.value === index ? null : index
}
</script>

<template>
  <section class="relative overflow-hidden rounded-3xl px-6 py-10 sm:px-10"> <!-- bg-clippeak-surface/40 -->
    <div class="absolute inset-0 bg-[linear-gradient(to_right,rgba(124,58,237,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(124,58,237,0.04)_1px,transparent_1px)] bg-[size:52px_52px]"></div>

    <div class="relative">
      <p class="text-center text-xs uppercase tracking-[0.26em] text-clippeak-violetLight/80">FAQ</p>
      <h2 class="mt-4 text-center font-display text-4xl font-extrabold sm:text-5xl">Questions fréquentes</h2>

      <div class="mx-auto mt-10 max-w-4xl space-y-3">
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
    </div>
  </section>
</template>
