<script setup lang="ts">
// Vagues d'invitations : le worker invite chaque heure les plus anciennes demandes (les parrainés d'abord), seulement quand le serveur est
// calme et dans la limite du plafond du jour. Ici : réglages, état, file d'attente avec la place de chacun, parrainages. Tu peux toujours
// inviter à la main (bouton « Inviter maintenant » ou onglet Invitations) : ces invitations ne comptent pas dans le plafond du jour.
interface QueueItem { id: string, position: number, login: string, displayName: string | null, createdAt: string, referred: boolean }
interface ReferredChannel { id: string, login: string, displayName: string, createdAt: string, referrer: string | null, validated: boolean }
interface Waves {
  config: { wavesEnabled: boolean, dailyCap: number, referralBonusCap: number }
  server: { verdict: 'ok' | 'attention' | 'sature' | null, calm: boolean, measuredAt: string | null }
  invitedToday: number
  nextWaveSize: number
  waveInvitesTotal: number
  queue: { total: number, referred: number, items: QueueItem[] }
  referrals: { clipsPerReferral: number, grantedThisMonth: number, channels: ReferredChannel[] }
}

const data = ref<Waves | null>(null)
const error = ref('')
const notice = ref('')
const busy = ref(false)
const cap = ref(20)
const bonusCap = ref(25)

async function load() {
  try {
    data.value = await $fetch<Waves>('/api/admin/waves')
    error.value = ''
  } catch (e: any) { error.value = e?.data?.statusMessage || 'Impossible de charger les vagues.' }
}
// Les champs de saisie ne sont remplis qu'une fois (sinon la mise à jour automatique effacerait ce que tu tapes).
let filled = false
watch(data, (d) => { if (d && !filled) { filled = true; cap.value = d.config.dailyCap; bonusCap.value = d.config.referralBonusCap } })

async function save(patch: Partial<Waves['config']>, message: string) {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/admin/waves', { method: 'PUT', body: patch })
    notice.value = message
    await load()
  } catch (e: any) { error.value = e?.data?.statusMessage || 'Réglage refusé.' } finally { busy.value = false }
}
async function inviteNow(item: QueueItem) {
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/admin/access-requests/${item.id}/invite`, { method: 'POST' })
    notice.value = `${item.login} est invité.`
    await load()
  } catch (e: any) { error.value = e?.data?.statusMessage || 'Invitation impossible.' } finally { busy.value = false }
}

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { load(); timer = setInterval(load, 60_000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

const date = (value: string) => new Date(value).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const verdictLabel = computed(() => data.value?.server.verdict === 'sature' ? 'Saturé' : data.value?.server.verdict === 'attention' ? 'À surveiller' : data.value?.server.verdict === 'ok' ? 'Calme' : 'Pas de mesure')
const verdictClass = computed(() => data.value?.server.verdict === 'sature' ? 'st-badge-error' : data.value?.server.verdict === 'attention' ? 'st-badge-warn' : data.value?.server.verdict === 'ok' ? 'st-badge-ok' : 'st-badge-neutral')
const status = computed(() => {
  const d = data.value
  if (!d) return ''
  if (!d.config.wavesEnabled) return 'Les vagues sont coupées : personne n’est invité automatiquement.'
  if (d.invitedToday >= d.config.dailyCap) return 'Le plafond du jour est atteint : la prochaine vague reprend demain (minuit, heure de Paris).'
  if (!d.server.calm) return 'Le serveur n’est pas assez calme : la vague est en pause et reprendra toute seule.'
  if (!d.queue.total) return 'La file est vide : rien à inviter.'
  return `La prochaine vague (dans l’heure) invitera ${d.nextWaveSize} chaîne${d.nextWaveSize > 1 ? 's' : ''}.`
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <p class="m-0 text-sm leading-relaxed st-muted">Chaque heure, le worker invite les plus anciennes demandes tant que le serveur est calme et que le plafond du jour n’est pas atteint. Il s’arrête dès que le serveur passe en « À surveiller » ou « Saturé ». Les streamers parrainés passent devant la file.</p>
    <p v-if="error" class="st-alert st-alert-error m-0" role="alert">{{ error }}</p>
    <p v-else-if="notice" class="st-alert st-alert-ok m-0" role="status">{{ notice }}</p>
    <p v-if="!data && !error" class="st-muted m-0 text-sm">Chargement…</p>

    <template v-if="data">
      <section class="st-card flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="m-0 flex-1 text-[17px] font-bold">Vagues automatiques</h2>
          <span class="st-badge" :class="data.config.wavesEnabled ? 'st-badge-ok' : 'st-badge-neutral'">{{ data.config.wavesEnabled ? 'Actives' : 'Coupées' }}</span>
          <span class="st-badge" :class="verdictClass">Serveur : {{ verdictLabel }}</span>
        </div>
        <p class="m-0 text-sm" role="status">{{ status }}</p>
        <div class="flex flex-wrap gap-6 text-sm">
          <div><div class="st-label">Invités aujourd’hui</div><div class="st-title text-2xl font-bold">{{ data.invitedToday }} / {{ data.config.dailyCap }}</div></div>
          <div><div class="st-label">En file d’attente</div><div class="st-title text-2xl font-bold">{{ data.queue.total }}</div></div>
          <div><div class="st-label">Dont parrainés</div><div class="st-title text-2xl font-bold">{{ data.queue.referred }}</div></div>
          <div><div class="st-label">Invités par vagues (total)</div><div class="st-title text-2xl font-bold">{{ data.waveInvitesTotal }}</div></div>
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <button type="button" class="st-btn" :disabled="busy" @click="save({ wavesEnabled: !data.config.wavesEnabled }, data.config.wavesEnabled ? 'Vagues coupées.' : 'Vagues activées.')">{{ data.config.wavesEnabled ? 'Couper les vagues' : 'Activer les vagues' }}</button>
          <label class="flex flex-col gap-1.5"><span class="st-label">Invitations par jour (plafond)</span>
            <input v-model.number="cap" type="number" min="0" max="500" class="st-field w-32" aria-label="Plafond d’invitations par jour">
          </label>
          <button type="button" class="st-btn-ghost" :disabled="busy" @click="save({ dailyCap: cap }, `Plafond du jour : ${cap} invitations.`)">Enregistrer</button>
        </div>
        <p class="m-0 text-xs st-muted">Une vague horaire invite au plus un huitième du plafond, pour étaler les arrivées sur la journée. Le plafond repart de zéro à minuit (heure de Paris). Tes invitations à la main ne comptent pas dedans.</p>
      </section>

      <section class="st-card flex flex-col gap-1 !pb-2">
        <h2 class="m-0 mb-1 text-[17px] font-bold">File d’attente ({{ data.queue.total }})</h2>
        <p class="m-0 mb-3 text-[13px] st-muted">Ordre réel des invitations : parrainés d’abord, puis ordre d’arrivée. Les demandes sont effacées après 90 jours.<span v-if="data.queue.total > data.queue.items.length"> Les {{ data.queue.items.length }} premières sont affichées.</span></p>
        <p v-if="!data.queue.items.length" class="st-muted m-0 border-t border-st-border pb-3 pt-3.5 text-sm">Personne n’attend pour l’instant.</p>
        <div v-for="q in data.queue.items" :key="q.id" class="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-st-border py-3">
          <div class="st-title w-10 flex-none text-lg font-bold">{{ q.position }}</div>
          <div class="min-w-0 flex-1 basis-40">
            <div class="break-words text-[15px] font-bold">{{ q.displayName || q.login }}</div>
            <div class="text-[13px] st-muted">{{ q.login }} · demandé le {{ date(q.createdAt) }}</div>
          </div>
          <span v-if="q.referred" class="st-badge st-badge-violet">Parrainé</span>
          <button type="button" class="st-btn-ghost text-sm" :disabled="busy" :aria-label="`Inviter ${q.login} maintenant`" @click="inviteNow(q)">Inviter maintenant</button>
        </div>
      </section>

      <section class="st-card flex flex-col gap-4">
        <h2 class="m-0 text-[17px] font-bold">Parrainage</h2>
        <p class="m-0 text-sm st-muted">Un streamer parrainé reçoit {{ data.referrals.clipsPerReferral }} clips gratuits à son inscription ; son parrain en reçoit {{ data.referrals.clipsPerReferral }} quand il valide son premier clip. Les clips valent pour le mois en cours. {{ data.referrals.grantedThisMonth }} clip{{ data.referrals.grantedThisMonth > 1 ? 's' : '' }} offert{{ data.referrals.grantedThisMonth > 1 ? 's' : '' }} ce mois-ci.</p>
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-1.5"><span class="st-label">Plafond de bonus par chaîne et par mois</span>
            <input v-model.number="bonusCap" type="number" min="0" max="500" class="st-field w-32" aria-label="Plafond mensuel de clips bonus de parrainage">
          </label>
          <button type="button" class="st-btn-ghost" :disabled="busy" @click="save({ referralBonusCap: bonusCap }, `Plafond de bonus : ${bonusCap} clips par mois.`)">Enregistrer</button>
        </div>
        <p v-if="!data.referrals.channels.length" class="st-muted m-0 text-sm">Aucun parrainage pour l’instant.</p>
        <div v-for="c in data.referrals.channels" :key="c.id" class="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-st-border py-3">
          <div class="min-w-0 flex-1 basis-44">
            <div class="break-words text-[15px] font-bold">{{ c.displayName }}</div>
            <div class="text-[13px] st-muted">parrainé par {{ c.referrer || 'une chaîne supprimée' }} · inscrit le {{ date(c.createdAt) }}</div>
          </div>
          <span class="st-badge" :class="c.validated ? 'st-badge-ok' : 'st-badge-neutral'">{{ c.validated ? 'Premier clip validé : bonus versé' : 'Pas encore de clip validé' }}</span>
        </div>
      </section>
    </template>
  </div>
</template>
