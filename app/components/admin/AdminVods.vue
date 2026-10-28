<script setup lang="ts">
// Ajout manuel d'une VOD (admin) : pour tester Clippeak en conditions reelles avec une VOD publique, meme d'un autre streamer.
// Elle est analysee comme une VOD de la chaine choisie ; les clips arrivent dans le studio de cette chaine.
const props = defineProps<{ admin: Admin }>()
const url = ref('')
const channelId = ref('')
const simulate = ref(false)

const realChannels = computed(() => props.admin.channels.value.filter(c => !c.demo))
watch(realChannels, (list) => { if (!list.some(c => c.id === channelId.value)) channelId.value = list[0]?.id ?? '' }, { immediate: true })
onMounted(() => props.admin.loadVods())

async function add() {
  await props.admin.addVod(channelId.value, url.value, simulate.value)
  if (!props.admin.error.value) { url.value = ''; simulate.value = false }
}

const phaseLook = {
  blocked: { label: 'Réservée aux abonnés', cls: 'st-badge-warn' },
  waiting: { label: 'En attente du worker', cls: 'st-badge-neutral' },
  analyzing: { label: 'Analyse en cours', cls: 'st-badge-info' },
  rendering: { label: 'Rendu des clips', cls: 'st-badge-info' },
  ready: { label: 'Terminée', cls: 'st-badge-ok' },
  failed: { label: 'Échec', cls: 'st-badge-error' }
} as const

// Durees estimees (grossieres) : on arrondit a la minute.
const minutes = (sec: number) => sec < 90 ? 'moins de 2 min' : `environ ${Math.round(sec / 60)} min`
function detail(v: AdminVod): string {
  const p = v.progress
  if (p.phase === 'blocked') return 'En attente que le streamer la rende publique (vérification toutes les 3 min)'
  if (p.phase === 'waiting') return `Analyse prévue : ${minutes(p.estimateSec ?? 0)} dès que le worker est libre`
  if (p.phase === 'analyzing') return `Estimation de l’analyse : ${minutes(p.estimateSec ?? 0)} au total`
  if (p.phase === 'rendering') return `${p.clipsTotal - p.clipsInProgress} clip(s) prêt(s) sur ${p.clipsTotal} · il reste ${minutes(p.estimateSec ?? 0)}`
  if (p.phase === 'ready') return `${v.clips} clip(s) issus de ${v.moments} moment(s)`
  return ''
}
const date = (value: string) => new Date(value).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div class="flex flex-col gap-6">
    <p class="m-0 text-sm leading-relaxed st-muted">
      Colle le lien d’une VOD Twitch <strong class="text-white">publique</strong> (pas réservée aux abonnés), même d’un autre streamer. Clippeak l’analyse comme si c’était une VOD de la chaîne choisie : ses clips arrivent dans le studio de cette chaîne, à valider comme les autres.
    </p>

    <form class="st-card flex flex-col gap-4" @submit.prevent="add">
      <h2 class="m-0 text-[17px] font-bold">Ajouter une VOD</h2>
      <label class="flex flex-col gap-1.5"><span class="st-label">Chaîne qui reçoit les clips</span>
        <select v-model="channelId" class="st-field" aria-label="Chaîne">
          <option v-for="c in realChannels" :key="c.id" :value="c.id">{{ c.displayName }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1.5"><span class="st-label">Lien de la VOD</span>
        <input v-model="url" class="st-field" placeholder="https://www.twitch.tv/videos/123456789" autocomplete="off" aria-label="Lien de la VOD">
      </label>
      <label class="flex items-start gap-2.5 text-sm leading-relaxed st-muted">
        <input v-model="simulate" type="checkbox" class="mt-1 h-4 w-4 accent-[#7C3AED]">
        <span><strong class="text-white">Essai du parcours « VOD d’abonnés »</strong> : fait comme si Twitch refusait cette VOD publique. Le streamer voit la carte « Action requise », puis les extraits sont récupérés et la carte « Tu peux la remettre comme avant » apparaît.</span>
      </label>
      <div><button type="submit" class="st-btn" :disabled="admin.busy.value || !channelId || !url.trim()">Ajouter la VOD</button></div>
    </form>

    <section class="st-card flex flex-col gap-1 !pb-2">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h2 class="m-0 text-[17px] font-bold">VODs ajoutées ({{ admin.vods.value.length }})</h2>
        <button type="button" class="st-btn-quiet" :disabled="admin.busy.value" @click="admin.loadVods()">Actualiser</button>
      </div>
      <p v-if="!admin.vods.value.length" class="st-muted m-0 pb-4 text-sm">Aucune VOD ajoutée pour l’instant.</p>
      <div v-for="v in admin.vods.value" :key="v.id" class="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-[#2C2837] py-3.5">
        <div class="min-w-0 flex-1 basis-52">
          <a :href="v.url" target="_blank" rel="noopener" class="break-words text-[15px] font-bold text-white no-underline hover:underline">{{ v.title || `VOD ${v.twitchVodId}` }}</a>
          <div class="text-[13px] st-muted">Pour {{ v.channel }} · ajoutée {{ date(v.createdAt) }}<template v-if="detail(v)"> · {{ detail(v) }}</template></div>
        </div>
        <span class="st-badge" :class="phaseLook[v.progress.phase].cls">{{ phaseLook[v.progress.phase].label }}</span>
        <button v-if="v.status === 'failed'" type="button" class="st-btn-ghost" :disabled="admin.busy.value" @click="admin.retryVod(v.id)">Relancer</button>
        <button v-if="v.status !== 'analyzing' && !v.moments" type="button" class="st-btn-quiet !text-[#FF9B8D] text-sm" :disabled="admin.busy.value" :aria-label="`Retirer la VOD ${v.twitchVodId}`" @click="admin.removeVod(v.id)">Retirer</button>
      </div>
    </section>
  </div>
</template>
