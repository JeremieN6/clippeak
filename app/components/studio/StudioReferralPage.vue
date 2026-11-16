<script setup lang="ts">
// Page « Parrainage » : lien personnel du streamer, comment ça marche, lives gagnés ce mois-ci et personnes amenées.
// Un parrainage est « validé » quand la personne amenée a son premier clip prêt : le parrain gagne alors 1 live pour le mois (plafonné).
const studio = useStudio()
interface Referral { code: string, referred: Array<{ name: string, validated: boolean }>, bonusThisMonth: number, bonusCap: number, livesPerReferral: number }
const referral = ref<Referral | null>(null)
const loading = ref(true)
const unavailable = ref(false)
const copied = ref(false)
const link = computed(() => referral.value && import.meta.client ? `${window.location.origin}/r/${referral.value.code}` : '')
const validatedCount = computed(() => referral.value?.referred.filter(r => r.validated).length ?? 0)
const pendingCount = computed(() => (referral.value?.referred.length ?? 0) - validatedCount.value)
const capReached = computed(() => Boolean(referral.value) && referral.value!.bonusThisMonth >= referral.value!.bonusCap)

watch(() => studio.channelId.value, async (id) => {
  referral.value = null
  unavailable.value = false
  if (!id) return
  loading.value = true
  try { referral.value = await $fetch<Referral>(`/api/studio/channels/${id}/referral`) } catch { unavailable.value = true }
  loading.value = false
}, { immediate: true })

async function copy() {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2500)
  } catch { /* le lien reste affiche : on peut le copier a la main */ }
}

const back = () => { studio.view.value = studio.onboarding.value?.completed || studio.clips.value.length ? 'dashboard' : 'onboarding' }
const plural = (n: number, one: string, many: string) => (n > 1 ? many : one)
</script>

<template>
  <main class="mx-auto flex w-full max-w-[880px] flex-col gap-7 px-5 pb-16 pt-6 sm:px-8 sm:pt-9">
    <div class="flex max-w-[640px] flex-col gap-2">
      <button type="button" class="-ml-2 inline-flex h-11 items-center gap-1.5 self-start rounded-[10px] border-0 bg-transparent px-2 text-sm font-bold text-st-muted hover:text-st-text" @click="back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        Retour
      </button>
      <h1 class="st-title m-0 text-[34px] font-extrabold leading-10">Parrainage</h1>
      <p class="m-0 text-base leading-[26px] st-muted">Parraine un autre streamer : quand son premier clip est prêt, tu gagnes un live de plus à découper ce mois-ci, et il passe devant la liste d’attente.</p>
    </div>

    <div v-if="loading" class="st-card h-40 animate-pulse" aria-busy="true" aria-label="Chargement du parrainage" />

    <div v-else-if="unavailable || !referral" class="st-alert st-alert-info" role="status">
      Le parrainage n’est pas disponible pour ce compte (démonstration ou test). Il apparaît sur ton vrai compte de streamer.
    </div>

    <template v-else>
      <section class="st-card flex flex-col gap-3" aria-label="Ton lien de parrainage">
        <h2 class="m-0 text-[17px] font-bold">Ton lien personnel</h2>
        <div class="flex flex-wrap items-center gap-2">
          <input :value="link" readonly class="st-field min-w-0 flex-1 basis-60" aria-label="Ton lien de parrainage" @focus="($event.target as HTMLInputElement).select()">
          <button type="button" class="st-btn" @click="copy">{{ copied ? 'Lien copié' : 'Copier le lien' }}</button>
        </div>
        <p class="m-0 text-[13px] leading-5 st-muted">Envoie-le à un streamer Twitch (en message privé, sur Discord, sur ton live…). Il s’inscrit avec ce lien, c’est tout.</p>
      </section>

      <section class="grid gap-3 sm:grid-cols-3" aria-label="Ton parrainage ce mois-ci">
        <div class="st-card flex flex-col gap-1">
          <div class="text-xs font-extrabold uppercase tracking-widest text-st-dim">Lives gagnés ce mois-ci</div>
          <div class="flex items-baseline gap-1.5"><span class="st-title text-3xl font-bold leading-none">{{ referral.bonusThisMonth }}</span><span class="text-sm st-muted">/ {{ referral.bonusCap }}</span></div>
          <div class="text-[13px] leading-5 st-muted">{{ capReached ? 'Maximum atteint : il revient le mois prochain.' : `Jusqu’à ${referral.bonusCap} par mois.` }}</div>
        </div>
        <div class="st-card flex flex-col gap-1">
          <div class="text-xs font-extrabold uppercase tracking-widest text-st-dim">Parrainages validés</div>
          <div class="st-title text-3xl font-bold leading-none">{{ validatedCount }}</div>
          <div class="text-[13px] leading-5 st-muted">Premier clip prêt.</div>
        </div>
        <div class="st-card flex flex-col gap-1">
          <div class="text-xs font-extrabold uppercase tracking-widest text-st-dim">En attente</div>
          <div class="st-title text-3xl font-bold leading-none">{{ pendingCount }}</div>
          <div class="text-[13px] leading-5 st-muted">Inscrits, sans premier clip prêt.</div>
        </div>
      </section>

      <section class="st-card flex flex-col gap-4" aria-label="Comment ça marche">
        <h2 class="m-0 text-[17px] font-bold">Comment ça marche</h2>
        <ol class="m-0 flex list-none flex-col gap-3 p-0">
          <li class="flex gap-3"><span class="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-st-accentSoft text-sm font-extrabold text-st-accentLight" aria-hidden="true">1</span><span class="text-sm leading-6">Tu envoies ton lien à un streamer.</span></li>
          <li class="flex gap-3"><span class="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-st-accentSoft text-sm font-extrabold text-st-accentLight" aria-hidden="true">2</span><span class="text-sm leading-6">Il se connecte avec Twitch grâce à ce lien : il passe devant la liste d’attente.</span></li>
          <li class="flex gap-3"><span class="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-st-accentSoft text-sm font-extrabold text-st-accentLight" aria-hidden="true">3</span><span class="text-sm leading-6">Dès que son premier clip est prêt, tu gagnes {{ referral.livesPerReferral }} {{ plural(referral.livesPerReferral, 'live', 'lives') }} de plus à découper pour le mois en cours (au maximum {{ referral.bonusCap }} par mois).</span></li>
        </ol>
        <p class="m-0 text-[13px] leading-5 st-muted">Un live offert est valable le mois où il est gagné. Il s’ajoute à tes lives gratuits, ça ne change pas ton abonnement.</p>
      </section>

      <section class="st-card flex flex-col gap-3" aria-label="Les personnes que tu as amenées">
        <h2 class="m-0 text-[17px] font-bold">Les personnes que tu as amenées</h2>
        <p v-if="!referral.referred.length" class="m-0 text-sm leading-6 st-muted">Personne pour l’instant. Copie ton lien ci-dessus et envoie-le à un ami streamer.</p>
        <ul v-else class="m-0 flex list-none flex-col gap-2 p-0">
          <li v-for="r in referral.referred" :key="r.name" class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-st-border px-3.5 py-2.5">
            <span class="min-w-0 truncate text-sm font-bold">{{ r.name }}</span>
            <span class="st-badge" :class="r.validated ? 'st-badge-ok' : 'st-badge-violet'">{{ r.validated ? 'Premier clip prêt : live bonus reçu' : 'Inscrit, en attente d’un premier clip prêt' }}</span>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>
