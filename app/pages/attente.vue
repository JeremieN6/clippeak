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
type WaitState = 'manual' | 'day_full' | 'next_wave' | 'open_full'
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
onMounted(() => trackEvent('waiting_page_opened'))
async function ask() {
  trackEvent('access_request_clicked')
  sending.value = true
  problem.value = ''
  try {
    await $fetch('/api/auth/access-request', { method: 'POST' })
    await refresh()
  } catch (e: any) {
    problem.value = e?.data?.statusMessage || 'Impossible de réserver ta place pour le moment.'
  } finally { sending.value = false }
}

// Ce que la file garantit, selon l'etat : on dit ou en est la personne, jamais a quelle heure elle sera invitee.
const guarantee = computed(() => {
  const state = status.value?.state
  if (state === 'open_full') return 'Les premières places sont prises. Tu seras invité dès qu’une nouvelle série s’ouvre, dans l’ordre d’arrivée.'
  if (state === 'day_full') return 'Les places du jour sont prises. Tu seras invité dans la prochaine vague, dans l’ordre d’arrivée.'
  if (state === 'next_wave') return 'Les invitations partent par vagues au fil de la journée, dans l’ordre d’arrivée.'
  return 'On t’invite dès qu’une place s’ouvre, dans l’ordre d’arrivée.'
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

    <main class="mx-auto flex max-w-lg flex-col gap-7 px-5 py-14 sm:py-20">
      <div class="flex flex-col gap-3">
        <span class="st-badge st-badge-violet self-start">Bêta sur invitation</span>
        <h1 class="st-title m-0 text-3xl font-bold leading-tight">
          <template v-if="status?.invited">Ta chaîne est invitée</template>
          <template v-else-if="status?.requested">Ta place est réservée</template>
          <template v-else>Ta chaîne n’a pas encore de place</template>
        </h1>
        <p v-if="!status?.invited && !status?.requested" class="m-0 text-[15px] leading-relaxed st-muted">
          <template v-if="login">Merci d’être passé, <strong class="text-white">{{ login }}</strong>. </template>
          Clippeak ouvre ses accès par petits groupes, pour que chaque streamer ait des clips rapides et soignés. Ce n’est pas un refus, juste une question de place.
        </p>
      </div>

      <!-- Invitee : on entre directement. -->
      <section v-if="login && status?.invited" class="st-card flex flex-col gap-4" role="status">
        <p class="m-0 text-[15px] leading-relaxed">Tu peux entrer dans Clippeak avec ton compte Twitch.</p>
        <a href="/api/auth/twitch" class="st-btn self-start no-underline">Me connecter avec Twitch</a>
      </section>

      <!-- Place reservee : position dans la file. -->
      <section v-else-if="login && status?.requested" class="st-card flex flex-col gap-4" role="status">
        <div v-if="status.position" class="flex items-baseline gap-3">
          <span class="st-title text-5xl font-bold leading-none">n° {{ status.position }}</span>
          <span class="text-sm st-muted">dans la file ({{ status.total }} personne{{ status.total > 1 ? 's' : '' }} en attente)</span>
        </div>
        <p class="m-0 text-[15px] leading-relaxed">{{ guarantee }}</p>
        <ul class="m-0 flex list-none flex-col gap-2 p-0 text-sm leading-relaxed st-muted">
          <li>Cette page se met à jour toute seule, tu peux aussi la fermer.</li>
          <li>Ta place est gardée 90 jours : il suffira de te reconnecter avec Twitch.</li>
        </ul>
      </section>

      <!-- Session de connexion expiree : on repart de Twitch. -->
      <section v-else-if="login && expired" class="st-card flex flex-col gap-4" role="status">
        <p class="m-0 text-[15px] leading-relaxed">Ta connexion a expiré (elle ne dure que 15 minutes). Reconnecte-toi avec Twitch pour réserver ta place.</p>
        <a href="/api/auth/twitch" class="st-btn self-start no-underline">Me reconnecter avec Twitch</a>
      </section>

      <!-- Pas encore de demande : une seule action. -->
      <section v-else-if="login" class="st-card flex flex-col gap-4">
        <h2 class="m-0 text-[17px] font-bold">Réserve ta place</h2>
        <p class="m-0 text-[15px] leading-relaxed st-muted">{{ guarantee }} Tu n’as rien d’autre à faire : dès que ta chaîne est invitée, tu entres directement en te reconnectant avec Twitch.</p>
        <button type="button" class="st-btn self-start" :disabled="sending" @click="ask">Réserver ma place</button>
        <p v-if="problem" class="m-0 text-sm text-st-error" role="alert">{{ problem }}</p>
      </section>

      <p v-if="login && !status?.invited" class="m-0 text-xs leading-relaxed st-muted">
        Aucun compte n’a été créé et rien n’est enregistré sur ta chaîne tant que tu n’as pas réservé ta place. Ensuite, on garde seulement ton pseudo Twitch ({{ login }}), 90 jours au plus, pour t’inviter. Tu peux le faire effacer en écrivant à contact.clippeak@sassify.fr. <NuxtLink to="/confidentialite" class="underline">Politique de confidentialité</NuxtLink>
      </p>

      <div class="flex flex-wrap gap-2">
        <NuxtLink to="/try-now" class="st-btn-ghost no-underline">Essayer la simulation</NuxtLink>
        <NuxtLink to="/" class="st-btn-quiet no-underline">Retour à l’accueil</NuxtLink>
      </div>
    </main>
  </div>
</template>
