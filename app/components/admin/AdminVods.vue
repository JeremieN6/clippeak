<script setup lang="ts">
// Ajout manuel d'une VOD (admin) : pour tester Clippeak en conditions reelles avec une VOD publique, meme d'un autre streamer.
// Elle est analysee comme une VOD de la chaine choisie ; les clips arrivent dans le studio de cette chaine.
const props = defineProps<{ admin: Admin }>()
const url = ref('')
const channelId = ref('')

const realChannels = computed(() => props.admin.channels.value.filter(c => !c.demo))
watch(realChannels, (list) => { if (!list.some(c => c.id === channelId.value)) channelId.value = list[0]?.id ?? '' }, { immediate: true })
onMounted(() => props.admin.loadVods())

async function add() {
  await props.admin.addVod(channelId.value, url.value)
  if (!props.admin.error.value) url.value = ''
}

const statusLook: Record<string, { label: string, cls: string }> = {
  ended: { label: 'En attente du worker', cls: 'st-badge-neutral' },
  analyzing: { label: 'Analyse en cours', cls: 'st-badge-info' },
  done: { label: 'Analysée', cls: 'st-badge-ok' },
  failed: { label: 'Échec', cls: 'st-badge-error' },
  live: { label: 'En direct', cls: 'st-badge-info' }
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
          <div class="text-[13px] st-muted">Pour {{ v.channel }} · ajoutée {{ date(v.createdAt) }}<template v-if="v.status === 'done'"> · {{ v.clips }} clip(s) issus de {{ v.moments }} moment(s)</template></div>
        </div>
        <span class="st-badge" :class="(statusLook[v.status] ?? statusLook.ended).cls">{{ (statusLook[v.status] ?? statusLook.ended).label }}</span>
        <button v-if="v.status === 'failed'" type="button" class="st-btn-ghost" :disabled="admin.busy.value" @click="admin.retryVod(v.id)">Relancer</button>
        <button v-if="v.status !== 'analyzing' && !v.moments" type="button" class="st-btn-quiet !text-[#FF9B8D] text-sm" :disabled="admin.busy.value" :aria-label="`Retirer la VOD ${v.twitchVodId}`" @click="admin.removeVod(v.id)">Retirer</button>
      </div>
    </section>
  </div>
</template>
