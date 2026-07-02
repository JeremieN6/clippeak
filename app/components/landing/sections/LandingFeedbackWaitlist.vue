<script setup lang="ts">
const emit = defineEmits<{
  (e: 'submitted'): void
}>()

const feedbackSubmitting = ref(false)
const feedbackSubmitted = ref(false)
const feedbackError = ref('')

const feedback = reactive({
  profil: 'streamer',
  outilAutomatise: 'oui',
  plateformeReception: 'discord',
  vodsParMois: '1-2',
  manqueType: 'rien',
  manqueLibre: '',
  email: '',
  plateformeAutre: ''
})

async function submitFeedback() {
  if (feedbackSubmitting.value || feedbackSubmitted.value) return

  feedbackSubmitting.value = true
  feedbackError.value = ''

  try {
    await $fetch('/api/feedback', {
      method: 'POST',
      body: {
        version: 'v1',
        profil: feedback.profil,
        outilAutomatise: feedback.outilAutomatise,
        plateformeReception: feedback.plateformeReception,
        plateformeAutre: feedback.plateformeReception === 'autre' ? feedback.plateformeAutre || null : null,
        vodsParMois: feedback.vodsParMois,
        manque: feedback.manqueType === 'rien' ? 'Rien, je suis chaud !' : feedback.manqueLibre || null,
        email: feedback.email || null
      }
    })

    feedbackSubmitted.value = true
    emit('submitted')
  } catch {
    feedbackError.value = 'Impossible d envoyer le feedback pour le moment. Reessaie dans quelques instants.'
  } finally {
    feedbackSubmitting.value = false
  }
}
</script>

<template>
  <section class="rounded-3xl border border-clippeak-violet/20 bg-clippeak-surface/55 p-6 sm:p-8">
    <h2 class="font-display text-3xl font-extrabold sm:text-4xl">Aide-nous à construire la suite</h2>
    <p class="mt-2 text-clippeak-muted">2 minutes pour façonner l'avenir de Clippeak</p>

    <div v-if="feedbackSubmitted" class="mt-6 rounded-xl border border-emerald-300/40 bg-emerald-400/10 p-4 text-emerald-300">
      Merci beaucoup ! On te previent dès que Clippeak est prêt. 🚀
    </div>

    <form v-else class="mt-6 space-y-6" @submit.prevent="submitFeedback">
      <div>
        <p class="mb-2 text-sm font-semibold">Tu es ?</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="rounded-xl border px-3 py-2 text-sm" :class="feedback.profil === 'streamer' ? 'border-clippeak-violet bg-clippeak-violet/20' : 'border-white/20'" @click="feedback.profil = 'streamer'">Streamer</button>
          <button type="button" class="rounded-xl border px-3 py-2 text-sm" :class="feedback.profil === 'clippeur' ? 'border-clippeak-violet bg-clippeak-violet/20' : 'border-white/20'" @click="feedback.profil = 'clippeur'">Clippeur (je clippe pour un streamer)</button>
          <button type="button" class="rounded-xl border px-3 py-2 text-sm" :class="feedback.profil === 'les deux' ? 'border-clippeak-violet bg-clippeak-violet/20' : 'border-white/20'" @click="feedback.profil = 'les deux'">Les deux</button>
        </div>
      </div>

      <div>
        <p class="mb-2 text-sm font-semibold">Préfererais-tu un outil 100% automatisé ? <span class="text-xs">(le processus se lance seul après ton live, pas besoin de récuperer l'URL de la VOD à la main)</span> </p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="rounded-xl border px-3 py-2 text-sm" :class="feedback.outilAutomatise === 'oui' ? 'border-clippeak-violet bg-clippeak-violet/20' : 'border-white/20'" @click="feedback.outilAutomatise = 'oui'">Oui</button>
          <button type="button" class="rounded-xl border px-3 py-2 text-sm" :class="feedback.outilAutomatise === 'non' ? 'border-clippeak-violet bg-clippeak-violet/20' : 'border-white/20'" @click="feedback.outilAutomatise = 'non'">Non</button>
          <button type="button" class="rounded-xl border px-3 py-2 text-sm" :class="feedback.outilAutomatise === 'peut-etre' ? 'border-clippeak-violet bg-clippeak-violet/20' : 'border-white/20'" @click="feedback.outilAutomatise = 'peut-etre'">Peut-être</button>
        </div>
      </div>

      <div>
        <p class="mb-2 text-sm font-semibold">Sur quelle plateforme voudrais-tu reçevoir tes clips ?</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="rounded-xl border px-3 py-2 text-sm" :class="feedback.plateformeReception === 'discord' ? 'border-clippeak-violet bg-clippeak-violet/20' : 'border-white/20'" @click="feedback.plateformeReception = 'discord'">Discord</button>
          <button type="button" class="rounded-xl border px-3 py-2 text-sm" :class="feedback.plateformeReception === 'telegram' ? 'border-clippeak-violet bg-clippeak-violet/20' : 'border-white/20'" @click="feedback.plateformeReception = 'telegram'">Telegram</button>
          <button type="button" class="rounded-xl border px-3 py-2 text-sm" :class="feedback.plateformeReception === 'mail' ? 'border-clippeak-violet bg-clippeak-violet/20' : 'border-white/20'" @click="feedback.plateformeReception = 'mail'">Mail</button>
          <button type="button" class="rounded-xl border px-3 py-2 text-sm" :class="feedback.plateformeReception === 'autre' ? 'border-clippeak-violet bg-clippeak-violet/20' : 'border-white/20'" @click="feedback.plateformeReception = 'autre'">Autre</button>
        </div>
        <input
          v-if="feedback.plateformeReception === 'autre'"
          v-model="feedback.plateformeAutre"
          type="text"
          placeholder="Precise la plateforme"
          class="mt-2 h-11 w-full rounded-xl border border-white/15 bg-black/35 px-4 text-sm outline-none focus:border-clippeak-violet"
        >
      </div>

      <div>
        <p class="mb-2 text-sm font-semibold">Combien de VODs traites-tu par mois environ ?</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="rounded-xl border px-3 py-2 text-sm" :class="feedback.vodsParMois === '1-2' ? 'border-clippeak-violet bg-clippeak-violet/20' : 'border-white/20'" @click="feedback.vodsParMois = '1-2'">1-2</button>
          <button type="button" class="rounded-xl border px-3 py-2 text-sm" :class="feedback.vodsParMois === '3-5' ? 'border-clippeak-violet bg-clippeak-violet/20' : 'border-white/20'" @click="feedback.vodsParMois = '3-5'">3-5</button>
          <button type="button" class="rounded-xl border px-3 py-2 text-sm" :class="feedback.vodsParMois === '6-10' ? 'border-clippeak-violet bg-clippeak-violet/20' : 'border-white/20'" @click="feedback.vodsParMois = '6-10'">6-10</button>
          <button type="button" class="rounded-xl border px-3 py-2 text-sm" :class="feedback.vodsParMois === '10+' ? 'border-clippeak-violet bg-clippeak-violet/20' : 'border-white/20'" @click="feedback.vodsParMois = '10+'">10+</button>
        </div>
      </div>

      <div>
        <p class="mb-2 text-sm font-semibold">Que manque-t-il a cet outil pour que tu l'utilises dès sa sortie ?</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="rounded-xl border px-3 py-2 text-sm" :class="feedback.manqueType === 'rien' ? 'border-clippeak-violet bg-clippeak-violet/20' : 'border-white/20'" @click="feedback.manqueType = 'rien'">Rien, je suis chaud !</button>
          <button type="button" class="rounded-xl border px-3 py-2 text-sm" :class="feedback.manqueType === 'libre' ? 'border-clippeak-violet bg-clippeak-violet/20' : 'border-white/20'" @click="feedback.manqueType = 'libre'">J'ai un truc à ajouter</button>
        </div>
        <textarea
          v-if="feedback.manqueType === 'libre'"
          v-model="feedback.manqueLibre"
          rows="4"
          class="mt-2 w-full rounded-xl border border-white/15 bg-black/35 px-4 py-3 text-sm outline-none focus:border-clippeak-violet"
        ></textarea>
      </div>

      <div>
        <label class="mb-2 block text-sm font-semibold">Entre ton email pour accéder en avant-première</label>
        <input
          v-model="feedback.email"
          type="email"
          class="h-11 w-full rounded-xl border border-white/15 bg-black/35 px-4 text-sm outline-none focus:border-clippeak-violet"
          placeholder="ton-email@exemple.com"
        >
      </div>

      <p v-if="feedbackError" class="text-sm font-semibold text-red-400">{{ feedbackError }}</p>

      <button
        type="submit"
        class="rounded-xl bg-clippeak-violet px-6 py-3 text-sm font-semibold transition hover:bg-clippeak-violetLight disabled:opacity-70"
        :disabled="feedbackSubmitting"
      >
        {{ feedbackSubmitting ? 'Envoi en cours...' : 'Envoyer mon feedback' }}
      </button>
    </form>
  </section>
</template>
