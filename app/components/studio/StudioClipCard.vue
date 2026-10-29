<script setup lang="ts">
// Carte d'un clip : lecture, note et pourquoi, alertes de qualite, legende modifiable, puis approuver / refuser / refaire.
// Approuver ne publie rien : la publication est une action separee (pas encore disponible).
const props = defineProps<{ clip: StudioClip }>()
const studio = useStudio()

import { fitTitleToBand } from '~~/server/utils/clipping/titleFit'

const draft = reactive({ caption: props.clip.caption ?? '', title: props.clip.title ?? '', note: '' })
const redoOpen = ref(false)

const statusLook: Record<string, { label: string, cls: string }> = {
  review: { label: 'À valider', cls: 'st-badge-violet' },
  approved: { label: 'Approuvé', cls: 'st-badge-ok' },
  rejected: { label: 'Refusé', cls: 'st-badge-neutral' },
  failed: { label: 'Échec du rendu', cls: 'st-badge-error' },
  queued: { label: 'En file', cls: 'st-badge-info' },
  rendering: { label: 'Rendu en cours', cls: 'st-badge-info' }
}
const look = computed(() => statusLook[props.clip.status] ?? statusLook.review)
const issues = computed(() => props.clip.qc?.issues ?? [])
const minutes = computed(() => props.clip.durationSec == null ? '' : `${Math.floor(props.clip.durationSec / 60)}:${String(props.clip.durationSec % 60).padStart(2, '0')}`)
const originLabel = computed(() => props.clip.origin === 'ref' ? 'Ressemble à un de tes clips' : 'Détecté par le chat')

// Meme calcul que le rendu : le titre ne fait jamais echouer le clip, il est reduit puis coupe si besoin.
const titleFit = computed(() => {
  const text = draft.title.trim()
  const style = studio.detail.value?.style.title
  if (!text || !style) return null
  return fitTitleToBand(text, style.fontSize ?? 68, style.maxLines ?? 3)
})
const titleNote = computed(() => {
  const fit = titleFit.value
  if (!fit) return ''
  if (fit.truncated) return 'Trop long : il sera coupé au dernier mot entier, avec « … ».'
  if (fit.shrunk) return `Un peu long : la police sera réduite (taille ${fit.fontSize}) pour que tout tienne.`
  return `${fit.lines} ligne${fit.lines > 1 ? 's' : ''} sur ${fit.maxLines}.`
})

const approve = () => studio.reviewClip(props.clip, 'approve', draft)
const reject = () => studio.reviewClip(props.clip, 'reject', draft)
const redo = () => studio.reviewClip(props.clip, 'requeue', draft)
</script>

<template>
  <article class="st-card flex flex-col gap-4 !p-4 sm:flex-row" :aria-label="clip.title || clip.hook || 'Clip'">
    <div class="mx-auto w-full max-w-[260px] flex-none sm:mx-0 sm:w-[190px] sm:max-w-none">
      <video v-if="clip.videoUrl" :src="clip.videoUrl" controls playsinline preload="metadata" class="aspect-[9/16] w-full rounded-xl bg-black" />
      <div v-else class="flex aspect-[9/16] w-full items-center justify-center rounded-xl bg-[#100F15] p-3 text-center text-[13px] leading-5 st-muted">
        {{ clip.error || (clip.status === 'queued' || clip.status === 'rendering' ? 'Le clip est en cours de préparation.' : 'Pas encore de vidéo') }}
      </div>
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <span class="st-badge" :class="look.cls">{{ look.label }}</span>
        <span v-if="clip.score != null" class="st-badge st-badge-neutral" :aria-label="`Note : ${clip.score} sur 10`">{{ clip.score }}/10</span>
        <span v-if="minutes" class="text-[13px] st-muted">{{ minutes }}</span>
      </div>
      <h3 class="m-0 break-words text-base font-bold leading-snug">{{ clip.title || clip.hook || 'Sans titre' }}</h3>
      <div class="text-[13px] st-muted">{{ originLabel }}<span v-if="clip.category"> · {{ clip.category }}</span></div>
      <p v-if="clip.rationale" class="m-0 rounded-[10px] bg-[#100F15] p-2.5 text-[13px] leading-5">
        <strong>Pourquoi cette note :</strong> {{ clip.rationale }}
        <span v-if="clip.scorer" class="st-muted"> ({{ clip.scorer === 'claude' ? 'notée par IA' : 'note locale' }})</span>
      </p>

      <ul v-if="issues.length" class="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Points à vérifier">
        <li v-for="(issue, i) in issues" :key="i" class="st-alert !p-2.5 !text-[13px]" :class="issue.severity === 'error' ? 'st-alert-error' : 'st-alert-warn'">{{ issue.message }}</li>
      </ul>
      <ul v-if="clip.illustrations?.length" class="m-0 list-none p-0 text-[13px] st-muted">
        <li v-for="(ill, i) in clip.illustrations" :key="i">Illustration : {{ ill.source || 'crédit manquant' }}</li>
      </ul>

      <template v-if="clip.status === 'review' || clip.status === 'approved'">
        <label :for="`cap-${clip.id}`" class="st-label">Légende</label>
        <textarea :id="`cap-${clip.id}`" v-model="draft.caption" rows="3" class="st-field !text-sm" :disabled="clip.status !== 'review'" />
        <div v-if="clip.hashtags" class="text-[13px] st-muted">{{ clip.hashtags }}</div>
      </template>

      <template v-if="clip.status === 'review'">
        <label :for="`note-${clip.id}`" class="st-label">Note pour toi (facultatif)</label>
        <input :id="`note-${clip.id}`" v-model="draft.note" class="st-field" placeholder="Ex : à republier samedi">
        <div class="flex flex-wrap gap-2">
          <button type="button" class="st-btn" :disabled="studio.busy.value" @click="approve">Approuver</button>
          <button type="button" class="st-btn-ghost" :disabled="studio.busy.value" @click="reject">Refuser</button>
          <button type="button" class="st-btn-ghost" :disabled="studio.busy.value" :aria-expanded="redoOpen" @click="redoOpen = !redoOpen">Refaire…</button>
        </div>
      </template>

      <div v-if="redoOpen || ['failed', 'rejected'].includes(clip.status)" class="flex flex-col gap-2">
        <label :for="`title-${clip.id}`" class="st-label">Nouveau titre (facultatif)</label>
        <input :id="`title-${clip.id}`" v-model="draft.title" class="st-field" placeholder="Laisse vide pour garder le titre">
        <div v-if="titleNote" class="st-hint" :class="titleFit?.truncated ? 'text-[#F3B2A6]' : ''" aria-live="polite">{{ titleNote }}</div>
        <div><button type="button" class="st-btn-ghost" :disabled="studio.busy.value" @click="redo">Refaire le rendu</button></div>
      </div>

      <div v-if="clip.status === 'approved' && clip.videoUrl" class="flex flex-wrap gap-2">
        <a :href="clip.videoUrl" :download="`${(clip.title || 'clip').replace(/[^\w-]+/g, '_')}.mp4`" class="st-btn-ghost no-underline">Télécharger le clip</a>
      </div>
      <StudioPublishPanel v-if="clip.status === 'approved' && clip.videoUrl" :clip="clip" />
      <p v-else-if="clip.status === 'approved'" class="m-0 text-[13px] st-muted">Approuvé : rien n’est publié.</p>
    </div>
  </article>
</template>
