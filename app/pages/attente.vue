<script setup lang="ts">
// Page d'attente : un streamer non invite qui se connecte avec Twitch (par exemple via un lien transmis par un ami) arrive ici
// au lieu d'une erreur. Rien n'a ete cree pour lui.
useHead({ title: 'Accès sur invitation – Clippeak', meta: [{ name: 'robots', content: 'noindex' }] })

const route = useRoute()
// Pseudo Twitch renvoye par le serveur : on n'affiche que ce qui ressemble a un pseudo.
const login = computed(() => {
  const raw = String(route.query.login ?? '')
  return /^[A-Za-z0-9_]{3,25}$/.test(raw) ? raw : ''
})

// File d'attente garantie : la page lit l'etat (invite ou non, place dans la file, vagues du jour) avec le cookie d'identite pose au retour de
// Twitch (15 minutes). Elle se met a jour toute seule et ouvre la connexion des que la chaine est invitee.
type WaitState = 'manual' | 'day_full' | 'next_wave'
interface Status { invited: boolean, requested: boolean, position: number | null, total: number, state: WaitState }
const status = ref<Status | null>(null)
const expired = ref(false)
async function refresh() {
  try {
    status.value = await $fetch<Status>('/api/auth/wait-status')
    expired.value = false
    if (status.value.invited) stopPolling()
  } catch { expired.value = true; stopPolling() }
}
let timer: ReturnType<typeof setInterval> | null = null
function stopPolling() { if (timer) { clearInterval(timer); timer = null } }
onMounted(() => {
  if (!login.value) return
  void refresh()
  timer = setInterval(refresh, 60_000)
})
onBeforeUnmount(stopPolling)

// Reserver sa place : enregistre la demande seulement au clic (l'identite vient du cookie signe pose au retour de Twitch).
const sending = ref(false)
const problem = ref('')
async function ask() {
  sending.value = true
  problem.value = ''
  try {
    await $fetch('/api/auth/access-request', { method: 'POST' })
    await refresh()
  } catch (e: any) {
    problem.value = e?.data?.statusMessage || 'Impossible de réserver ta place pour le moment.'
  } finally { sending.value = false }
}

// Message de la file : on dit ou en est la personne, jamais a quelle heure elle sera invitee.
const queueMessage = computed(() => {
  const state = status.value?.state
  if (state === 'day_full') return 'Les places du jour sont prises : ta place est réservée, tu seras invité dans la prochaine vague.'
  if (state === 'next_wave') return 'Ta place est réservée : les invitations partent par vagues au fil de la journée, dans l’ordre d’arrivée.'
  return 'Ta place est réservée : on t’invite dès qu’une place s’ouvre.'
})
</script>

<template>
  <div class="st-root min-h-screen bg-st-bg">
    <header class="flex min-h-16 items-center justify-between gap-4 border-b border-st-border px-5 py-2 sm:px-8">
      <NuxtLink to="/" class="flex min-h-11 items-center gap-2.5 text-st-text no-underline">
        <BrandMark class="h-8 w-8" />
        <span class="st-title text-lg font-bold">Clippeak</span>
      </NuxtLink>
    </header>

    <main class="mx-auto flex max-w-md flex-col gap-6 px-5 py-16">
      <span class="st-badge st-badge-violet self-start">Bêta sur invitation</span>
      <div class="flex flex-col gap-3">
        <h1 class="st-title m-0 text-3xl font-bold">Ton accès n’est pas encore ouvert</h1>
        <p class="m-0 text-sm leading-relaxed st-muted">
          <template v-if="login">Merci d’être passé, <strong class="text-white">{{ login }}</strong>. </template>
          Clippeak ouvre ses accès par petits groupes, pour que chaque streamer ait des clips rapides et soignés. Ta chaîne n’est pas encore dans la liste : ce n’est pas un refus, juste une question de place.
        </p>
      </div>

      <section class="st-card flex flex-col gap-3">
        <h2 class="m-0 text-[17px] font-bold">Et maintenant ?</h2>
        <ul class="m-0 flex list-none flex-col gap-2 p-0 text-sm leading-relaxed st-muted">
          <li>Aucun compte n’a été créé et rien n’a été enregistré sur ta chaîne.</li>
          <li>Clique sur « Réserver ma place » : ta place dans la file est garantie, dans l’ordre d’arrivée.</li>
          <li>Reviens sur cette page ou reconnecte-toi avec Twitch : dès que ta chaîne est invitée, tu entres directement.</li>
        </ul>
      </section>

      <section v-if="login" class="flex flex-col gap-3">
        <div v-if="status?.invited" class="st-alert st-alert-ok flex-col !items-start gap-3" role="status">
          <div class="font-bold">Bonne nouvelle : ta chaîne est invitée.</div>
          <a href="/api/auth/twitch" class="st-btn no-underline">Me connecter avec Twitch</a>
        </div>
        <template v-else-if="status?.requested">
          <div class="st-alert st-alert-ok flex-col !items-start gap-1" role="status">
            <div class="font-bold">{{ queueMessage }}</div>
            <div v-if="status.position" class="text-sm">Tu es n° {{ status.position }} dans la file ({{ status.total }} personne{{ status.total > 1 ? 's' : '' }} en attente).</div>
            <div class="text-sm opacity-90">Cette page se met à jour toute seule. Tu peux aussi la fermer : ta place est gardée 90 jours au plus, il suffira de te reconnecter avec Twitch.</div>
          </div>
        </template>
        <template v-else>
          <p v-if="status?.state === 'day_full'" class="m-0 text-sm st-muted">Les places du jour sont prises. Réserve la tienne : tu seras invité dans la prochaine vague, dans l’ordre d’arrivée.</p>
          <button type="button" class="st-btn self-start" :disabled="sending || expired" @click="ask">Réserver ma place</button>
          <p v-if="expired" class="m-0 text-sm st-muted">Ta session de connexion a expiré. <a href="/api/auth/twitch" class="underline">Reconnecte-toi avec Twitch</a> pour réserver ta place.</p>
        </template>
        <p v-if="problem" class="m-0 text-sm text-st-error" role="alert">{{ problem }}</p>
        <p class="m-0 text-xs st-muted">On garde seulement ton pseudo Twitch ({{ login }}), pour 90 jours au plus, pour t’inviter. Tu peux le faire effacer en écrivant à contact.clippeak@sassify.fr. <NuxtLink to="/confidentialite" class="underline">Politique de confidentialité</NuxtLink></p>
      </section>

      <div class="flex flex-wrap gap-2">
        <NuxtLink to="/try-now" class="st-btn no-underline">Essayer la simulation</NuxtLink>
        <NuxtLink to="/" class="st-btn-ghost no-underline">Retour à l’accueil</NuxtLink>
      </div>
    </main>
  </div>
</template>
