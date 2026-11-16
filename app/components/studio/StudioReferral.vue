<script setup lang="ts">
// Parrainage : lien personnel du streamer. Un streamer parrainé reçoit 5 clips à son inscription ; son parrain en reçoit 5 quand il valide
// son premier clip (valables pour le mois, plafonnés). Ne s'affiche que quand le parrainage est disponible pour la chaîne.
const studio = useStudio()
interface Referral { code: string, referred: Array<{ name: string, validated: boolean }>, bonusThisMonth: number, bonusCap: number, clipsPerReferral: number, signupBonus: number }
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
      <h2 class="m-0 flex-1 text-[17px] font-bold">Parraine un streamer, gagne des clips</h2>
      <span v-if="referral.bonusThisMonth" class="st-badge st-badge-ok">+{{ referral.bonusThisMonth }} clips ce mois-ci</span>
    </div>
    <p class="m-0 text-sm leading-relaxed st-muted">Quand un streamer s’inscrit avec ton lien et valide son premier clip, tu gagnes {{ referral.clipsPerReferral }} clips en plus pour le mois, et lui en reçoit {{ referral.clipsPerReferral }} dès son inscription. Il passe aussi devant la liste d’attente. Maximum {{ referral.bonusCap }} clips offerts par mois.</p>
    <div class="flex flex-wrap items-center gap-2">
      <input :value="link" readonly class="st-field min-w-0 flex-1 basis-60" aria-label="Ton lien de parrainage" @focus="($event.target as HTMLInputElement).select()">
      <button type="button" class="st-btn" @click="copy">{{ copied ? 'Lien copié' : 'Copier le lien' }}</button>
    </div>
    <p v-if="referral.signupBonus" class="m-0 text-[13px] text-st-ok">Tu as reçu {{ referral.signupBonus }} clips offerts pour ton inscription avec le lien d’un parrain.</p>
    <ul v-if="referral.referred.length" class="m-0 flex list-none flex-col gap-1 p-0 text-[13px] st-muted">
      <li v-for="r in referral.referred" :key="r.name">{{ r.name }} : {{ r.validated ? 'premier clip validé, bonus reçu' : 'inscrit, en attente d’un premier clip validé' }}</li>
    </ul>
  </section>
</template>
