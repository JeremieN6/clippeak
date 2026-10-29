<script setup lang="ts">
// Carte d'un clip (maquette « Carte clip ») : video 9:16 avec etats en surimpression, statut / origine / note, titre et legende
// modifiables, « Pourquoi cette note », alertes de qualite avec icones, puis approuver / refuser / refaire.
// Approuver ne publie rien : la publication est une action separee (panneau de publication, clip approuve).
const props = defineProps<{ clip: StudioClip }>()
const studio = useStudio()

import { fitTitleToBand } from '~~/server/utils/clipping/titleFit'

const draft = reactive({ caption: props.clip.caption ?? '', title: props.clip.title ?? '', note: '' })
const whyOpen = ref(false)

const statusLook: Record<string, { label: string, cls: string }> = {
  review: { label: 'À valider', cls: 'st-badge-warn' },
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
const working = computed(() => props.clip.status === 'queued' || props.clip.status === 'rendering')
// Le titre peut etre change tant que le clip n'est pas approuve ni en cours de rendu : un changement relance le rendu.
const titleEditable = computed(() => ['review', 'failed', 'rejected'].includes(props.clip.status))
const titleEdited = computed(() => titleEditable.value && draft.title.trim() !== '' && draft.title.trim() !== (props.clip.title ?? '').trim())

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
  <article class="st-card flex flex-col gap-5 !p-5 sm:flex-row" :aria-label="clip.title || clip.hook || 'Clip'">
    <!-- Video -->
    <div class="mx-auto flex w-full max-w-[260px] flex-none flex-col gap-2.5 sm:mx-0 sm:w-[190px] sm:max-w-none">
      <div class="relative aspect-[9/16] w-full overflow-hidden rounded-[14px] border border-st-border bg-black">
        <video v-if="clip.videoUrl" :src="clip.videoUrl" controls playsinline preload="metadata" class="h-full w-full object-cover" />
        <div v-else-if="working" class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-st-bg p-4 text-center text-st-info" role="status">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 109 9"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" /></path></svg>
          <div class="text-sm font-bold">Rendu en cours…</div>
          <div class="text-xs text-st-muted">Le clip sera prêt dans quelques minutes.</div>
        </div>
        <div v-else-if="clip.status === 'failed'" class="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-st-errorBg p-4 text-center text-st-error" role="alert">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3zM12 10v4M12 17h.01" /></svg>
          <div class="text-sm font-bold">Le rendu a échoué</div>
        </div>
        <div v-else class="absolute inset-0 flex items-center justify-center bg-st-field p-3 text-center text-[13px] leading-5 st-muted">Pas encore de vidéo</div>
      </div>
      <div v-if="minutes || clip.category" class="flex flex-wrap gap-1.5 text-xs font-semibold text-st-dim">
        <span v-if="minutes">{{ minutes }}</span><span v-if="minutes && clip.category" aria-hidden="true">·</span><span v-if="clip.category">{{ clip.category }}</span>
      </div>
    </div>

    <!-- Infos -->
    <div class="flex min-w-0 flex-1 flex-col gap-4">
      <div class="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span class="st-badge" :class="look.cls">{{ look.label }}</span>
        <span class="inline-flex min-h-7 items-center rounded-full border border-st-borderStrong px-3 py-0.5 text-xs font-bold text-st-soft">{{ originLabel }}</span>
        <span v-if="clip.score != null" class="st-badge ml-auto !bg-st-accentBg !font-extrabold !text-st-accentText" :aria-label="`Note : ${clip.score} sur 10`">{{ clip.score }} / 10</span>
      </div>

      <div class="flex flex-col gap-1.5">
        <label :for="`title-${clip.id}`" class="st-label">Titre en haut du clip</label>
        <input :id="`title-${clip.id}`" v-model="draft.title" class="st-field" :disabled="!titleEditable" placeholder="Laisse vide pour garder le titre">
        <div v-if="titleEdited" class="text-[13px] font-semibold leading-5 text-st-warn" aria-live="polite">Le rendu du clip sera relancé avec ce nouveau titre. Appuie sur « Refaire ».</div>
        <div v-if="titleEditable && titleNote" class="st-hint" :class="titleFit?.truncated ? 'text-st-error' : ''" aria-live="polite">{{ titleNote }}</div>
      </div>

      <div v-if="clip.status === 'review' || clip.status === 'approved'" class="flex flex-col gap-1.5">
        <label :for="`cap-${clip.id}`" class="st-label">Légende et hashtags</label>
        <textarea :id="`cap-${clip.id}`" v-model="draft.caption" rows="4" class="st-field" :disabled="clip.status !== 'review'" />
        <div class="st-hint">Les hashtags sont à la fin de la légende : tu peux les modifier ici.</div>
      </div>

      <div v-if="clip.rationale" class="flex flex-col gap-2">
        <button type="button" class="inline-flex min-h-11 items-center gap-1.5 self-start border-0 bg-transparent pr-3 text-sm font-bold text-st-accentLight" :aria-expanded="whyOpen" :aria-controls="`why-${clip.id}`" @click="whyOpen = !whyOpen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" :class="whyOpen ? 'rotate-90' : ''"><path d="M9 6l6 6-6 6" /></svg>
          Pourquoi cette note ?
        </button>
        <div v-if="whyOpen" :id="`why-${clip.id}`" class="rounded-xl border border-st-border bg-st-field px-3.5 py-3 text-sm leading-[22px] text-st-soft">
          {{ clip.rationale }}
          <span v-if="clip.scorer" class="st-muted"> ({{ clip.scorer === 'claude' ? 'notée par IA' : 'note locale' }})</span>
        </div>
      </div>

      <ul v-if="issues.length" class="m-0 flex list-none flex-col gap-2 p-0" aria-label="Points à vérifier">
        <li v-for="(issue, i) in issues" :key="i" class="st-alert" :class="issue.severity === 'error' ? 'st-alert-error' : 'st-alert-warn'">
          <svg v-if="issue.severity === 'error'" class="mt-px flex-none" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16h.01" /></svg>
          <svg v-else class="mt-px flex-none" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3zM12 10v4M12 17h.01" /></svg>
          <div><strong class="font-extrabold">{{ issue.severity === 'error' ? 'À corriger.' : 'À vérifier.' }}</strong> {{ issue.message }}</div>
        </li>
      </ul>
      <div v-if="clip.error && clip.status === 'failed'" class="st-alert st-alert-error" role="alert">
        <svg class="mt-px flex-none" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16h.01" /></svg>
        <div>{{ clip.error }}</div>
      </div>

      <div v-if="clip.illustrations?.length" class="flex flex-col gap-2">
        <div class="st-label">Illustrations utilisées</div>
        <div v-for="(ill, i) in clip.illustrations" :key="i" class="flex min-h-11 items-center gap-2.5 rounded-[10px] border border-st-border bg-st-field px-3 py-2 text-[13px] st-muted">
          <svg class="flex-none" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M4 16l5-4 4 3 3-2 4 3" /></svg>
          <span>{{ ill.source || 'crédit manquant' }}</span>
        </div>
      </div>

      <div v-if="clip.status === 'review'" class="flex flex-col gap-1.5">
        <label :for="`note-${clip.id}`" class="st-label">Note pour toi <span class="font-medium text-st-dim">(facultatif)</span></label>
        <input :id="`note-${clip.id}`" v-model="draft.note" class="st-field" placeholder="Exemple : à reposter vendredi">
      </div>

      <!-- Actions -->
      <div v-if="clip.status === 'review'" class="flex flex-wrap gap-2 pt-1">
        <button type="button" class="st-btn" :disabled="studio.busy.value || titleEdited" @click="approve">Approuver</button>
        <button v-if="titleEdited" type="button" class="st-btn-ghost !border-st-accentBorder !bg-st-accentBg !text-st-accentText" :disabled="studio.busy.value" @click="redo">Refaire avec ce titre</button>
        <button v-else type="button" class="st-btn-ghost" :disabled="studio.busy.value" @click="redo">Refaire le rendu</button>
        <button type="button" class="st-btn-ghost !border-st-errorBorder !bg-transparent !text-st-error" :disabled="studio.busy.value" @click="reject">Refuser</button>
      </div>
      <div v-else-if="clip.status === 'failed' || clip.status === 'rejected'" class="flex flex-wrap gap-2 pt-1">
        <button type="button" class="st-btn" :disabled="studio.busy.value" @click="redo">Refaire le rendu</button>
      </div>

      <div v-if="clip.status === 'approved' && clip.videoUrl" class="flex flex-wrap gap-2">
        <a :href="clip.videoUrl" :download="`${(clip.title || 'clip').replace(/[^\w-]+/g, '_')}.mp4`" class="st-btn-ghost no-underline">Télécharger le clip</a>
      </div>
      <StudioPublishPanel v-if="clip.status === 'approved' && clip.videoUrl" :clip="clip" />
      <p v-else-if="clip.status === 'approved'" class="m-0 text-[13px] st-muted">Approuvé : rien n’est publié.</p>
    </div>
  </article>
</template>
