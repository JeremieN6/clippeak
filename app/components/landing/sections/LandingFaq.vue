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
    q: 'Comment avoir accès ?',
    a: "L'accès se fait sur invitation pendant la bêta. Connecte-toi avec Twitch : si ta chaîne n'est pas encore invitée, tu peux demander à être prévenu dès qu'une place s'ouvre."
  },
  {
    q: 'Combien de clips vais-je obtenir ?',
    a: "Clippeak prépare jusqu'à 8 clips par live, classés par note et présentés par lots de 4. Ça dépend ensuite de l'activité de ton chat, et de ton plafond mensuel (40 clips en gratuit)."
  },
  {
    q: 'Mes données sont-elles conservées ?',
    a: 'Tes clips, tes photos et tes réglages restent dans ton espace tant que ton compte existe. Les vidéos des clips refusés sont supprimées après 14 jours. Tu peux tout exporter ou supprimer toi-même depuis « Mes données ». Les détails sont dans la politique de confidentialité.'
  },
  {
    q: 'C’est gratuit ?',
    a: "Oui, pendant la bêta : jusqu'à 40 clips par mois. Une offre payante (120 clips par mois) arrive ensuite, résiliable à tout moment."
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
