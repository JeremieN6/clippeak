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
      <p class="m-0 text-base leading-[26px] st-muted">Invite un autre streamer. Quand son premier clip est prêt, tu gagnes 1 live de plus à découper ce mois-ci.</p>
    </div>

    <div v-if="loading" class="st-card h-40 animate-pulse" aria-busy="true" aria-label="Chargement du parrainage" />

    <section v-else-if="unavailable || !referral" class="flex flex-col items-start gap-3.5 rounded-2xl border border-dashed border-st-borderStrong bg-st-surface p-5 sm:p-6" role="status">
      <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-st-raised2 text-st-soft" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg></span>
      <div class="st-title text-xl font-bold leading-[26px]">Le parrainage n’est pas disponible avec un compte de démonstration</div>
      <div class="max-w-[560px] text-[15px] leading-6 text-st-soft">Avec ton compte Twitch, tu as ton lien personnel et tu gagnes des lives en invitant d’autres streamers.</div>
    </section>

    <template v-else>
      <section class="flex flex-col gap-3.5 rounded-2xl border border-st-border bg-st-surface p-5 sm:p-6" aria-labelledby="pl-t">
        <h2 id="pl-t" class="st-title m-0 text-lg font-bold leading-6">Ton lien personnel</h2>
        <div class="flex flex-col gap-2.5 sm:flex-row">
          <input :value="link" readonly class="st-field !h-[52px] min-w-0 flex-1 !text-base !font-semibold" aria-label="Ton lien de parrainage" @focus="($event.target as HTMLInputElement).select()">
          <button type="button" class="inline-flex h-[52px] min-w-[170px] items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-bold" :class="copied ? 'border border-st-okBorder bg-st-okBg text-st-ok' : 'border-0 bg-st-accent text-white'" @click="copy">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="copied ? 'M5 12.5l4.5 4.5L19 7.5' : 'M9 9h10v10H9zM5 15V5h10'" /></svg>{{ copied ? 'Lien copié' : 'Copier le lien' }}
          </button>
        </div>
        <div class="min-h-5 text-[13px] font-bold text-st-ok" role="status">{{ copied ? 'Ton lien est copié. Tu peux le coller où tu veux.' : '' }}</div>
      </section>

      <div v-if="capReached" class="flex items-start gap-3 rounded-[14px] bg-st-okBg px-4 py-3.5 text-st-ok" role="status">
        <svg class="mt-px flex-none" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        <div class="text-sm leading-[22px]"><strong class="font-extrabold">Maximum atteint : {{ referral.bonusCap }} lives gagnés ce mois-ci.</strong><div class="mt-0.5 opacity-90">Tu peux continuer à inviter : la personne passe quand même devant la liste d’attente. Tu pourras regagner des lives le mois prochain.</div></div>
      </div>

      <section class="grid gap-3.5 sm:grid-cols-3" aria-label="Tes compteurs">
        <div class="flex flex-col gap-2.5 rounded-2xl border border-st-border bg-st-surface px-5 py-[18px]">
          <div class="text-[13px] font-bold st-muted">Lives gagnés ce mois-ci</div>
          <div class="flex items-baseline gap-1.5"><span class="st-title text-[34px] font-extrabold leading-none">{{ referral.bonusThisMonth }}</span><span class="text-base font-bold st-muted">sur {{ referral.bonusCap }}</span></div>
          <div class="h-1.5 overflow-hidden rounded-[3px] bg-st-raised2" role="progressbar" aria-label="Lives gagnés ce mois-ci" :aria-valuenow="referral.bonusThisMonth" aria-valuemin="0" :aria-valuemax="referral.bonusCap"><div class="st-bar h-full" :style="{ width: `${Math.min(100, Math.round(referral.bonusThisMonth / Math.max(1, referral.bonusCap) * 100))}%`, ...(capReached ? { background: 'var(--st-ok)' } : {}) }" /></div>
        </div>
        <div class="flex flex-col gap-2.5 rounded-2xl border border-st-border bg-st-surface px-5 py-[18px]">
          <div class="text-[13px] font-bold st-muted">Parrainages validés</div>
          <div class="st-title text-[34px] font-extrabold leading-none">{{ validatedCount }}</div>
          <div class="text-[13px] text-st-dim">Premier clip prêt</div>
        </div>
        <div class="flex flex-col gap-2.5 rounded-2xl border border-st-border bg-st-surface px-5 py-[18px]">
          <div class="text-[13px] font-bold st-muted">En attente</div>
          <div class="st-title text-[34px] font-extrabold leading-none">{{ pendingCount }}</div>
          <div class="text-[13px] text-st-dim">Pas encore de premier clip prêt</div>
        </div>
      </section>

      <section class="flex flex-col gap-3.5" aria-labelledby="cm-t">
        <h2 id="cm-t" class="st-title m-0 text-xl font-bold leading-[26px]">Comment ça marche</h2>
        <ol class="m-0 grid list-none gap-3.5 p-0 sm:grid-cols-3">
          <li class="flex flex-col gap-2 rounded-2xl border border-st-border bg-st-surface px-5 py-[18px]"><span class="flex h-7 w-7 items-center justify-center rounded-full bg-st-accentBg text-[13px] font-extrabold text-st-accentSoft" aria-hidden="true">1</span><div class="text-base font-extrabold">Partage ton lien</div><div class="text-sm leading-[22px] st-muted">Envoie-le à un autre streamer.</div></li>
          <li class="flex flex-col gap-2 rounded-2xl border border-st-border bg-st-surface px-5 py-[18px]"><span class="flex h-7 w-7 items-center justify-center rounded-full bg-st-accentBg text-[13px] font-extrabold text-st-accentSoft" aria-hidden="true">2</span><div class="text-base font-extrabold">Il s’inscrit avec ton lien</div><div class="text-sm leading-[22px] st-muted">Il passe devant la liste d’attente.</div></li>
          <li class="flex flex-col gap-2 rounded-2xl border border-st-border bg-st-surface px-5 py-[18px]"><span class="flex h-7 w-7 items-center justify-center rounded-full bg-st-accentBg text-[13px] font-extrabold text-st-accentSoft" aria-hidden="true">3</span><div class="text-base font-extrabold">Son premier clip est prêt</div><div class="text-sm leading-[22px] st-muted">Tu gagnes {{ referral.livesPerReferral }} {{ plural(referral.livesPerReferral, 'live', 'lives') }} de plus à découper ce mois-ci ({{ referral.bonusCap }} au maximum par mois).</div></li>
        </ol>
      </section>

      <section class="flex flex-col gap-3.5" aria-labelledby="pa-t">
        <h2 id="pa-t" class="st-title m-0 text-xl font-bold leading-[26px]">Les personnes que tu as amenées</h2>
        <ul v-if="referral.referred.length" class="m-0 flex list-none flex-col overflow-hidden rounded-2xl border border-st-border bg-st-surface p-0">
          <li v-for="r in referral.referred" :key="r.name" class="flex min-h-16 flex-wrap items-center gap-3.5 border-t border-st-border px-[18px] py-3.5 first:border-t-0">
            <span class="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-st-accentBg text-[15px] font-extrabold text-st-accentSoft" aria-hidden="true">{{ r.name.charAt(0).toUpperCase() }}</span>
            <span class="min-w-0 flex-[1_1_160px] truncate text-[15px] font-bold">{{ r.name }}</span>
            <span class="inline-flex min-h-[30px] items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold leading-[18px]" :class="r.validated ? 'bg-st-okBg text-st-ok' : 'bg-st-warnBg text-st-warn'">
              <svg class="flex-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="r.validated ? 'M5 12.5l4.5 4.5L19 7.5' : 'M12 7v5l3 2'" /></svg>{{ r.validated ? 'Premier clip prêt : live bonus reçu' : 'Inscrit, en attente d’un premier clip prêt' }}
            </span>
          </li>
        </ul>
        <div v-else class="flex flex-col gap-2.5 rounded-2xl border border-dashed border-st-borderStrong bg-st-surface p-5 sm:p-6">
          <div class="st-title text-lg font-bold leading-6">Personne n’est encore passé par ton lien</div>
          <div class="max-w-[560px] text-sm leading-[22px] text-st-soft">Envoie ton lien à un autre streamer, par message ou sur ton Discord. Dès que son premier clip est prêt, tu gagnes 1 live de plus.</div>
          <button type="button" class="st-btn !min-h-12 self-start" @click="copy">{{ copied ? 'Lien copié' : 'Copier le lien' }}</button>
        </div>
      </section>
    </template>
  </main>
</template>
