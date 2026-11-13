<script setup lang="ts">
// « Publier les approuves… » (maquette) : publie d'un coup les clips approuves d'un lot sur YouTube Shorts, tout de suite ou sur les prochains
// creneaux (un clip par creneau). Rien ne part sans le clic de confirmation. TikTok demande des reglages clip par clip : il reste dans « Details ».
import { DEFAULT_SLOT_TIMES, suggestSlots } from '~~/server/utils/clipping/publishing'

const props = defineProps<{ lot: number, clips: StudioClip[] }>()
const emit = defineEmits<{ close: [] }>()
const studio = useStudio()

const mode = ref<'now' | 'slots'>('slots')
const chosen = reactive<Record<string, boolean>>(Object.fromEntries(props.clips.map(c => [c.id, true])))
const selected = computed(() => props.clips.filter(c => chosen[c.id]))
const taken = computed(() => studio.clips.value.flatMap(c => c.publications).filter(p => p.status === 'scheduled' && p.platform !== 'tiktok').map(p => new Date(p.scheduledAt)))
const slots = computed(() => suggestSlots(new Date(), DEFAULT_SLOT_TIMES, selected.value.length, taken.value))
const fmt = (d: Date) => d.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const youtubeConnected = computed(() => studio.connections.value.some(c => c.platform === 'youtube' && c.connected))
const tooMany = computed(() => mode.value === 'now' && selected.value.length > 5)

async function confirm() {
  if (!selected.value.length) return
  await studio.publishMany(selected.value, 'youtube', mode.value === 'now' ? null : slots.value)
  if (!studio.error.value) emit('close')
}

const panel = ref<HTMLElement | null>(null)
let opener: HTMLElement | null = null
let previousOverflow = ''
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.stopPropagation(); emit('close') }
  if (e.key === 'Tab' && panel.value) {
    const items = [...panel.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])')]
    if (!items.length) return
    if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items[items.length - 1].focus() }
    else if (!e.shiftKey && document.activeElement === items[items.length - 1]) { e.preventDefault(); items[0].focus() }
  }
}
onMounted(() => {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.addEventListener('keydown', onKey)
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  nextTick(() => panel.value?.focus())
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = previousOverflow
  opener?.focus?.()
})
</script>

<template>
  <div class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[rgba(5,4,8,.78)] px-4 py-10">
    <div ref="panel" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="bp-t" class="st-card flex w-full max-w-[560px] flex-col gap-4 !p-5">
      <div class="flex items-start justify-between gap-3">
        <div><h2 id="bp-t" class="st-title m-0 text-xl font-bold">Publier les approuvés du lot {{ lot || '-' }}</h2><div class="mt-0.5 text-[13px] st-muted">Sur YouTube Shorts. Rien ne part avant ton clic sur le bouton du bas.</div></div>
        <button type="button" class="flex h-11 w-11 flex-none items-center justify-center rounded-[10px] border-0 bg-transparent text-st-muted hover:text-st-text" aria-label="Fermer" @click="emit('close')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div v-if="!youtubeConnected" role="alert" class="st-alert st-alert-warn !items-center">
        <span class="min-w-0 flex-1">YouTube n’est pas connecté : connecte-le pour publier.</span>
        <a href="/api/auth/youtube" class="st-btn no-underline">Connecter YouTube</a>
      </div>

      <fieldset class="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend class="st-label mb-1 p-0">Clips à publier ({{ selected.length }} sur {{ clips.length }})</legend>
        <label v-for="c in clips" :key="c.id" class="flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] border border-st-border px-3 py-2">
          <input v-model="chosen[c.id]" type="checkbox" class="m-0 h-5 w-5 flex-none accent-st-accent">
          <span class="min-w-0 flex-1 truncate text-sm font-semibold">{{ c.title || c.hook || 'Clip sans titre' }}</span>
          <span v-if="mode === 'slots' && chosen[c.id] && slots[selected.indexOf(c)]" class="flex-none text-xs st-muted">{{ fmt(slots[selected.indexOf(c)]) }}</span>
        </label>
      </fieldset>

      <fieldset class="m-0 flex flex-col gap-2 border-0 p-0">
        <legend class="st-label mb-1 p-0">Quand ?</legend>
        <label class="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold"><input v-model="mode" type="radio" value="slots" class="m-0 h-5 w-5 accent-st-accent">Sur les prochains créneaux (un clip par créneau : 12 h 30, 18 h 30, 21 h)</label>
        <label class="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold"><input v-model="mode" type="radio" value="now" class="m-0 h-5 w-5 accent-st-accent">Tout de suite (les uns après les autres)</label>
      </fieldset>

      <p v-if="tooMany" class="st-alert st-alert-warn m-0">YouTube limite le nombre d’envois par jour (environ 6 pour toute l’application) : au-delà, les derniers peuvent échouer. Préfère les créneaux.</p>
      <p class="m-0 text-[12px] leading-4 st-muted">Tant que Google n’a pas validé Clippeak, YouTube garde les vidéos en privé : tu pourras les passer en public depuis YouTube Studio. Pour publier sur TikTok, ouvre « Détails » d’un clip : TikTok demande des réglages clip par clip.</p>

      <div class="flex flex-wrap gap-2">
        <button type="button" class="st-btn min-w-[220px] flex-1" :disabled="!youtubeConnected || !selected.length || studio.busy.value" @click="confirm">{{ mode === 'now' ? `Publier ${selected.length} clip${selected.length > 1 ? 's' : ''} maintenant` : `Programmer ${selected.length} clip${selected.length > 1 ? 's' : ''}` }}</button>
        <button type="button" class="st-btn-ghost" @click="emit('close')">Annuler</button>
      </div>
    </div>
  </div>
</template>
