<script setup lang="ts">
// Parrainage : lien personnel du streamer. Quand une personne amenée a son premier clip prêt, son parrain gagne 1 live en plus pour le mois
// (5 par mois au maximum). Ne s'affiche que quand le parrainage est disponible pour la chaîne.
const studio = useStudio()
interface Referral { code: string, referred: Array<{ name: string, validated: boolean }>, bonusThisMonth: number, bonusCap: number, livesPerReferral: number }
const referral = ref<Referral | null>(null)
const copied = ref(false)
const link = computed(() => referral.value && import.meta.client ? `${window.location.origin}/r/${referral.value.code}` : '')

watch(() => studio.channelId.value, async (id) => {
  referral.value = null
  if (!id) return
  try { referral.value = await $fetch<Referral>(`/api/studio/channels/${id}/referral`) } catch { referral.value = null }
}, { immediate: true })

async function copy() {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2500)
  } catch { /* le lien reste affiche : on peut le copier a la main */ }
}
</script>

<template>
  <section v-if="referral" class="st-card flex flex-col gap-3" aria-label="Parrainage">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="m-0 flex-1 text-[17px] font-bold">Parraine un streamer, gagne des lives</h2>
      <span v-if="referral.bonusThisMonth" class="st-badge st-badge-ok">+{{ referral.bonusThisMonth }} live{{ referral.bonusThisMonth > 1 ? 's' : '' }} ce mois-ci</span>
    </div>
    <p class="m-0 text-sm leading-relaxed st-muted">Quand un streamer s’inscrit avec ton lien et que son premier clip est prêt, tu gagnes {{ referral.livesPerReferral }} live de plus à découper pour le mois. Il passe aussi devant la liste d’attente. Maximum {{ referral.bonusCap }} lives offerts par mois.</p>
    <div class="flex flex-wrap items-center gap-2">
      <input :value="link" readonly class="st-field min-w-0 flex-1 basis-60" aria-label="Ton lien de parrainage" @focus="($event.target as HTMLInputElement).select()">
      <button type="button" class="st-btn" @click="copy">{{ copied ? 'Lien copié' : 'Copier le lien' }}</button>
    </div>
    <ul v-if="referral.referred.length" class="m-0 flex list-none flex-col gap-1 p-0 text-[13px] st-muted">
      <li v-for="r in referral.referred" :key="r.name">{{ r.name }} : {{ r.validated ? 'premier clip prêt, live bonus reçu' : 'inscrit, en attente d’un premier clip prêt' }}</li>
    </ul>
  </section>
</template>
