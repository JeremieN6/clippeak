<script setup lang="ts">
// Carte d'une video longue preparee, 16:9 (maquette « Carte · Video preparee 16:9 »). Etats : a valider, prete a publier, en preparation,
// publiee, en echec, refusee. Approuver ne publie rien : « Publier sur YouTube… » ouvre une confirmation, puis la publication part.
import { formatClock } from '~~/server/utils/clipping/longExtract'

const props = defineProps<{ clip: StudioClip }>()
const studio = useStudio()

type State = 'validate' | 'ready' | 'preparing' | 'published' | 'failed' | 'refused'
const youtube = computed(() => props.clip.publications.find(p => p.platform === 'youtube' && p.status !== 'cancelled'))
const sending = computed(() => youtube.value?.status === 'scheduled' || youtube.value?.status === 'publishing')
const state = computed<State>(() => {
  if (isPublished(props.clip)) return 'published'
  const s = props.clip.status
  if (s === 'queued' || s === 'rendering') return 'preparing'
  if (s === 'review') return 'validate'
  if (s === 'approved') return 'ready'
  if (s === 'failed') return 'failed'
  return 'refused'
})
const look = computed(() => ({
  validate: { label: 'À valider', cls: 'st-badge-warn' },
  ready: { label: 'Prête à publier', cls: 'st-badge-violet' },
  preparing: { label: 'En préparation', cls: 'st-badge-info' },
  published: { label: 'Publiée', cls: 'st-badge-ok' },
  failed: { label: 'En échec', cls: 'st-badge-error' },
  refused: { label: 'Refusée', cls: 'st-badge-neutral' }
})[state.value])

const sourceLabel = computed(() => ({ manual: 'Ajout manuel', streamer: 'Repère du streamer', analysis: 'Analyse du live' } as Record<string, string>)[props.clip.source ?? ''] ?? '')
const meta = computed(() => {
  const parts = [props.clip.vodTitle || 'Live sans titre']
  if (props.clip.startSec != null && props.clip.endSec != null) parts.push(`${formatClock(props.clip.startSec, true)} → ${formatClock(props.clip.endSec, true)}`)
  if (sourceLabel.value) parts.push(sourceLabel.value)
  return parts.join(' · ')
})
const duration = computed(() => props.clip.durationSec == null ? '' : formatClock(props.clip.durationSec))
const youtubeConnected = computed(() => studio.connections.value.some(c => c.platform === 'youtube' && c.connected))

const draft = reactive({ title: props.clip.title ?? '', caption: props.clip.caption ?? '' })
watch(() => [props.clip.title, props.clip.caption], ([t, c]) => { draft.title = t ?? ''; draft.caption = c ?? '' })
const editable = computed(() => state.value === 'validate')
const confirming = ref(false)

const approve = () => studio.reviewClip(props.clip, 'approve', { title: draft.title, caption: draft.caption })
const refuse = () => studio.reviewClip(props.clip, 'reject')
const reopen = () => { confirming.value = false; return studio.reviewClip(props.clip, 'reopen') }
const retry = () => studio.reviewClip(props.clip, 'requeue')
async function publish() {
  confirming.value = false
  await studio.publishClip(props.clip, 'youtube', null)
}
const fmtDate = (iso: string) => new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <article class="st-card flex h-full flex-col overflow-hidden !p-0" :aria-label="clip.title || 'Extrait long'">
    <div class="relative aspect-video w-full bg-black">
      <video v-if="clip.videoUrl" :src="clip.videoUrl" controls playsinline preload="metadata" class="h-full w-full object-contain" />
      <div v-else class="flex h-full w-full items-center justify-center bg-st-raised2 text-st-dim" aria-hidden="true">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M10 8.5l5 3.5-5 3.5z" /></svg>
      </div>
      <span class="st-badge pointer-events-none absolute left-2.5 top-2.5" :class="look.cls">{{ look.label }}</span>
      <span v-if="duration" class="pointer-events-none absolute bottom-2.5 right-2.5 rounded-md bg-black/80 px-2 py-0.5 text-[13px] font-extrabold text-white">{{ duration }}</span>
    </div>

    <div class="flex flex-1 flex-col gap-3.5 p-5">
      <div class="text-[13px] leading-5 st-muted">{{ meta }}</div>

      <div class="flex flex-col gap-1.5">
        <label :for="`lv-title-${clip.id}`" class="st-label">Titre de la vidéo YouTube</label>
        <input :id="`lv-title-${clip.id}`" v-model="draft.title" class="st-field" maxlength="100" :disabled="!editable">
      </div>
      <div class="flex flex-col gap-1.5">
        <label :for="`lv-cap-${clip.id}`" class="st-label">Légende</label>
        <textarea :id="`lv-cap-${clip.id}`" v-model="draft.caption" rows="3" class="st-field" :disabled="!editable" />
      </div>

      <div v-if="state === 'preparing'" class="flex flex-col gap-2">
        <div role="status" class="text-sm font-bold text-st-info">Préparation de la vidéo…<template v-if="clip.progress != null"> {{ clip.progress }} %</template></div>
        <div class="h-2 overflow-hidden rounded bg-st-raised2" role="progressbar" aria-label="Avancement de la préparation" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="clip.progress ?? undefined"><div class="st-bar h-full" :class="clip.progress == null ? 'st-bar-live' : ''" :style="{ width: `${clip.progress ?? 60}%` }" /></div>
        <div class="text-[13px] leading-5 st-muted">Une vidéo longue demande quelques minutes. Tu peux quitter cette page.</div>
      </div>

      <div v-if="state === 'failed'" role="alert" class="flex items-start gap-2.5 rounded-xl bg-st-errorBg px-3.5 py-3 text-st-error">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" class="mt-0.5 flex-none"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" /></svg>
        <div class="text-sm leading-[21px]"><strong class="font-extrabold">La préparation a échoué.</strong><div class="mt-0.5 opacity-90">{{ clip.error || 'La vidéo du live n’est peut-être plus disponible : Twitch a pu supprimer cette VOD.' }} Tu peux réessayer.</div></div>
      </div>

      <div v-if="state === 'published'" role="status" class="flex items-start gap-2.5 rounded-xl bg-st-okBg px-3.5 py-3 text-st-ok">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mt-0.5 flex-none"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        <div class="text-sm leading-[21px]"><strong class="font-extrabold">Publiée sur YouTube<template v-if="youtube?.publishedAt"> · {{ fmtDate(youtube.publishedAt) }}</template></strong><div class="mt-0.5 opacity-90">Elle est privée tant que Google n’a pas validé Clippeak : tu peux la rendre publique depuis YouTube Studio.</div></div>
      </div>

      <div v-if="state === 'ready' && sending" role="status" class="flex items-center gap-2.5 rounded-xl bg-st-infoBg px-3.5 py-3 text-sm font-bold text-st-info">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 109 9"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" /></path></svg>
        Envoi vers YouTube…
      </div>
      <div v-else-if="state === 'ready' && youtube?.status === 'failed'" role="alert" class="rounded-xl bg-st-errorBg px-3.5 py-3 text-sm leading-[21px] text-st-error"><strong class="font-extrabold">La publication a échoué.</strong> {{ youtube.error }}</div>

      <div v-if="state === 'ready' && confirming" role="group" aria-label="Publier sur YouTube" class="flex flex-col gap-3 rounded-xl border border-st-accentBorder bg-st-field p-3.5">
        <div class="text-[15px] font-extrabold">Publier sur YouTube</div>
        <div class="text-sm text-st-soft">Chaîne : celle que tu as choisie à la connexion YouTube.</div>
        <div class="rounded-[10px] bg-st-warnBg px-3 py-2.5 text-[13px] leading-5 text-st-warn">La vidéo sera envoyée en privé. YouTube garde les vidéos privées tant que Google n’a pas validé Clippeak. Tu pourras la rendre publique depuis YouTube Studio.</div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="st-btn min-w-[180px] flex-1" :disabled="studio.busy.value" @click="publish">Publier sur YouTube</button>
          <button type="button" class="st-btn-ghost flex-1" @click="confirming = false">Annuler</button>
        </div>
      </div>

      <div class="mt-auto flex flex-wrap gap-2">
        <template v-if="state === 'validate'">
          <button type="button" class="st-btn min-w-[150px] flex-1" :disabled="studio.busy.value" @click="approve">Approuver</button>
          <button type="button" class="st-btn-ghost min-w-[120px] flex-1 !text-st-error" :disabled="studio.busy.value" @click="refuse">Refuser</button>
          <p class="m-0 basis-full text-[13px] leading-5 st-muted">Approuver ne publie rien : tu choisiras ensuite quand publier sur YouTube.</p>
        </template>
        <template v-else-if="state === 'ready'">
          <template v-if="youtubeConnected">
            <button type="button" class="st-btn min-w-[200px] flex-1" :disabled="confirming || sending || studio.busy.value" @click="confirming = true">Publier sur YouTube…</button>
          </template>
          <p v-else class="m-0 basis-full text-sm st-muted">Connecte YouTube (en haut de la page) pour publier.</p>
          <a v-if="clip.videoUrl" :href="clip.videoUrl" :download="`${(clip.title || 'extrait').replace(/[^\w-]+/g, '_')}.mp4`" class="st-btn-ghost min-w-[130px] flex-1 no-underline">Télécharger</a>
          <button v-if="!sending" type="button" class="st-btn-quiet" :disabled="studio.busy.value" @click="reopen">Remettre à valider</button>
        </template>
        <a v-else-if="state === 'published' && youtube?.url" :href="youtube.url" target="_blank" rel="noopener" class="st-btn-ghost min-w-[200px] flex-1 no-underline">Voir sur YouTube</a>
        <button v-else-if="state === 'failed'" type="button" class="st-btn min-w-[150px] flex-1" :disabled="studio.busy.value" @click="retry">Réessayer</button>
        <button v-else-if="state === 'refused'" type="button" class="st-btn-ghost min-w-[180px] flex-1" :disabled="studio.busy.value" @click="reopen">Remettre à valider</button>
      </div>
    </div>
  </article>
</template>
