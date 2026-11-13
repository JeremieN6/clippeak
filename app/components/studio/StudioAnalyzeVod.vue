<script setup lang="ts">
// « Analyser une VOD » (maquette « Aucun clip pour l'instant ») : le streamer colle le lien d'une ancienne rediffusion de SA chaine ;
// Clippeak l'analyse comme un live termine et les clips arrivent dans le tableau de bord.
const studio = useStudio()
const open = ref(false)
const url = ref('')
const sent = ref(false)

async function send() {
  if (!url.value.trim() || studio.busy.value) return
  sent.value = false
  await studio.addVod(url.value.trim())
  if (!studio.error.value) { sent.value = true; url.value = ''; open.value = false }
}
</script>

<template>
  <div class="flex w-full max-w-md flex-col items-center gap-3">
    <button v-if="!open" type="button" class="st-btn" @click="open = true">Analyser une VOD</button>
    <form v-else class="flex w-full flex-col gap-3 text-left" @submit.prevent="send">
      <label class="flex flex-col gap-1.5">
        <span class="st-label">Lien de ta VOD Twitch</span>
        <input v-model="url" class="st-field" type="url" inputmode="url" placeholder="https://www.twitch.tv/videos/123456789" autocomplete="off" required>
      </label>
      <div class="flex flex-wrap gap-2">
        <button type="submit" class="st-btn" :disabled="!url.trim() || studio.busy.value">Analyser cette VOD</button>
        <button type="button" class="st-btn-quiet" @click="open = false; url = ''">Annuler</button>
      </div>
      <p class="m-0 text-[13px] leading-5 st-muted">Seulement tes propres rediffusions, en public. Compte de quelques minutes à plusieurs heures selon sa durée. Une VOD à la fois, trois par jour.</p>
    </form>
    <p v-if="sent && !studio.error.value" class="m-0 text-sm font-semibold text-st-ok" role="status">C’est parti : tes clips arriveront ici.</p>
  </div>
</template>
