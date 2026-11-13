<script setup lang="ts">
// Publication d'un clip approuve : choisir la plateforme, publier maintenant ou programmer. Rien ne part sans un clic ici.
import { DEFAULT_SLOT_TIMES, suggestSlots } from '~~/server/utils/clipping/publishing'

const props = defineProps<{ clip: StudioClip }>()
const studio = useStudio()

const isLong = computed(() => props.clip.format === 'long')
const platformName: Record<string, string> = { youtube: props.clip.format === 'long' ? 'YouTube' : 'YouTube Shorts', tiktok: 'TikTok', instagram: 'Instagram Reels' }
// Un extrait long (16:9) ne se publie que sur YouTube.
const connected = computed(() => studio.connections.value.filter(c => c.connected && (!isLong.value || c.platform === 'youtube')))
const platform = ref(connected.value[0]?.platform ?? 'youtube')
watch(connected, (list) => { if (!list.some(c => c.platform === platform.value)) platform.value = list[0]?.platform ?? 'youtube' })

const publications = computed(() => props.clip.publications.filter(p => p.status !== 'cancelled'))
const current = computed(() => publications.value.find(p => p.platform === platform.value))
// TikTok part tout de suite (pas de programmation) : « programme » veut seulement dire que le worker ne l'a pas encore prise. Le formulaire
// disparait alors, pour que l'envoi ne ressemble pas a un echec, et le clip est relu jusqu'a la fin de la publication.
const sentNow = (p: { platform: string, status: string }) => p.platform === 'tiktok' && p.status === 'scheduled'
const busyOrDone = computed(() => current.value?.status === 'published' || current.value?.status === 'publishing' || (!!current.value && sentNow(current.value)))
const pending = computed(() => publications.value.some(p => p.status === 'publishing' || sentNow(p)))
let poll: ReturnType<typeof setInterval> | null = null
watch(pending, (on) => {
  if (poll) { clearInterval(poll); poll = null }
  if (on) poll = setInterval(() => { studio.loadClips() }, 6000)
}, { immediate: true })
onBeforeUnmount(() => { if (poll) clearInterval(poll) })

// Creneaux proposes : hors de ceux deja pris par d'autres clips de la chaine (les envois TikTok partent tout de suite, ils ne comptent pas).
const taken = computed(() => studio.clips.value.flatMap(c => c.publications).filter(p => p.status === 'scheduled' && p.platform !== 'tiktok').map(p => new Date(p.scheduledAt)))
const slots = computed(() => suggestSlots(new Date(), DEFAULT_SLOT_TIMES, 3, taken.value))
const picked = ref<number | null>(null)
const custom = ref('')
const when = computed<Date | null>(() => (custom.value ? new Date(custom.value) : picked.value != null ? slots.value[picked.value] ?? null : null))
const fmt = (d: Date | string) => new Date(d).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

async function schedule() {
  if (!when.value) return
  await studio.publishClip(props.clip, platform.value, when.value)
  picked.value = null
  custom.value = ''
}
</script>

<template>
  <section class="flex flex-col gap-3 rounded-[10px] bg-st-field p-3" aria-label="Publication">
    <h4 class="m-0 text-sm font-bold">Publier</h4>

    <p v-if="!connected.length" class="m-0 text-[13px] leading-5 st-muted">
      Approuvé : rien n’est publié. Connecte YouTube ou TikTok à l’étape « Tes plateformes » pour publier d’ici, ou télécharge le clip pour le publier toi-même.
    </p>

    <template v-else>
      <select v-if="connected.length > 1" v-model="platform" class="st-field !min-h-10" aria-label="Plateforme">
        <option v-for="c in connected" :key="c.platform" :value="c.platform">{{ platformName[c.platform] }}</option>
      </select>

      <ul v-if="publications.length" class="m-0 flex list-none flex-col gap-2 p-0">
        <li v-for="p in publications" :key="p.id" class="flex flex-wrap items-center gap-2 text-[13px]">
          <span class="st-badge" :class="p.status === 'published' ? 'st-badge-ok' : p.status === 'failed' ? 'st-badge-error' : 'st-badge-info'">
            {{ p.status === 'published' ? 'Publié' : p.status === 'failed' ? 'Échec' : p.status === 'publishing' || sentNow(p) ? 'Envoi en cours…' : 'Programmé' }}
          </span>
          <span class="st-muted">{{ platformName[p.platform] }}<template v-if="p.status === 'scheduled' && !sentNow(p)"> · {{ fmt(p.scheduledAt) }}</template><template v-else-if="p.status === 'published' && p.publishedAt"> · le {{ fmt(p.publishedAt) }}</template></span>
          <a v-if="p.url" :href="p.url" target="_blank" rel="noopener" class="font-semibold text-st-accentLight">Voir</a>
          <button v-if="p.status === 'scheduled' || p.status === 'failed'" type="button" class="st-btn-quiet !min-h-8 !px-2 text-[13px]" :disabled="studio.busy.value" @click="studio.cancelPublication(p.id)">{{ p.status === 'failed' ? 'Abandonner' : 'Annuler' }}</button>
          <span v-if="p.status === 'failed' && p.error" class="basis-full text-st-error">{{ p.error }}</span>
        </li>
      </ul>

      <StudioTiktokPublish v-if="platform === 'tiktok' && !busyOrDone" :key="clip.id" :clip="clip" />

      <template v-else-if="!busyOrDone">
        <div class="flex flex-wrap gap-2">
          <button type="button" class="st-btn" :disabled="studio.busy.value" @click="studio.publishClip(clip, platform, null)">Publier maintenant</button>
        </div>
        <div class="flex flex-col gap-2">
          <div class="st-label !text-[13px]">Ou programmer</div>
          <div class="flex flex-wrap gap-2">
            <button v-for="(s, i) in slots" :key="s.toISOString()" type="button" class="st-chip !h-11 !px-3.5 !text-[13px]" :class="picked === i && !custom ? '!bg-st-accent !text-white' : ''" :aria-pressed="picked === i && !custom" @click="picked = i; custom = ''">{{ fmt(s) }}</button>
          </div>
          <input v-model="custom" type="datetime-local" class="st-field !min-h-10 sm:!w-auto" aria-label="Autre date et heure">
          <div><button type="button" class="st-btn-ghost" :disabled="studio.busy.value || !when" @click="schedule">Programmer{{ when ? ` le ${fmt(when)}` : '' }}</button></div>
        </div>
        <p v-if="platform === 'youtube'" class="m-0 text-[12px] leading-4 st-muted">Tant que Google n’a pas validé Clippeak, YouTube garde les vidéos publiées par Clippeak en privé : tu pourras les passer en public depuis YouTube Studio.</p>
      </template>
    </template>
  </section>
</template>
