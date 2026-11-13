<script setup lang="ts">
// Ligne compacte d'un clip (maquette « Tableau de bord · bureau ») : miniature, etat, origine, note, titre, duree et categorie, alerte
// « A verifier », ligne de publication, progression du rendu, boutons rapides, puis « Details » qui ouvre le panneau du clip.
const props = defineProps<{ clip: StudioClip }>()
const emit = defineEmits<{ open: [] }>()
const studio = useStudio()

const platformName: Record<string, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' }
const published = computed(() => isPublished(props.clip))
const state = computed(() => {
  if (published.value) return 'published'
  const s = props.clip.status
  return s === 'queued' || s === 'rendering' ? 'rendering' : s
})
const look = computed(() => ({
  review: { label: 'À valider', cls: 'st-badge-warn' },
  approved: { label: 'Approuvé', cls: 'st-badge-ok' },
  published: { label: 'Publié', cls: 'st-badge-ok' },
  rejected: { label: 'Refusé', cls: 'st-badge-neutral' },
  rendering: { label: 'Rendu en cours', cls: 'st-badge-info' },
  failed: { label: 'Échec du rendu', cls: 'st-badge-error' }
} as Record<string, { label: string, cls: string }>)[state.value] ?? { label: 'À valider', cls: 'st-badge-warn' })

const origin = computed(() => props.clip.origin === 'ref' ? 'Ressemble à un de tes clips' : 'Détecté par le chat')
const score = computed(() => props.clip.score == null ? '' : String(props.clip.score).replace('.', ','))
const duration = computed(() => props.clip.durationSec == null ? '' : `${Math.floor(props.clip.durationSec / 60)}:${String(props.clip.durationSec % 60).padStart(2, '0')}`)
const hasIssue = computed(() => (props.clip.qc?.issues ?? []).length > 0)
const playable = computed(() => !!props.clip.videoUrl)

// « Publie sur TikTok · YouTube programme · Instagram : echec » : une phrase par plateforme concernee.
const pubLine = computed(() => props.clip.publications
  .filter(p => p.status !== 'cancelled')
  .map((p) => {
    const name = platformName[p.platform] ?? p.platform
    return p.status === 'published' ? `Publié sur ${name}` : p.status === 'failed' ? `${name} : échec de la publication` : p.status === 'publishing' ? `Envoi vers ${name}…` : `${name} : programmé`
  }).join(' · '))

const approve = () => studio.reviewClip(props.clip, 'approve', { caption: props.clip.caption ?? undefined })
const refuse = () => studio.reviewClip(props.clip, 'reject')
const reopen = () => studio.reviewClip(props.clip, 'reopen')
const retry = () => studio.reviewClip(props.clip, 'requeue')
</script>

<template>
  <article class="flex min-w-0 gap-4 rounded-2xl border border-st-border bg-st-surface p-4" :aria-label="clip.title || clip.hook || 'Clip'">
    <button type="button" class="relative h-[149px] w-[84px] flex-none overflow-hidden rounded-[10px] border-0 bg-gradient-to-b from-[#2B2F6B] via-[#17192F] to-[#0F2A2A] p-0" :aria-label="`Ouvrir le clip : ${clip.title || 'sans titre'}`" @click="emit('open')">
      <video v-if="clip.videoUrl" :src="`${clip.videoUrl}#t=0.2`" muted playsinline preload="metadata" class="pointer-events-none absolute inset-0 h-full w-full object-cover" tabindex="-1" />
      <span v-if="state === 'rendering'" class="absolute inset-0 flex items-center justify-center bg-st-bg/70" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--st-info)" stroke-width="2.6" stroke-linecap="round"><path d="M12 3a9 9 0 109 9"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" /></path></svg>
      </span>
      <span v-else-if="state === 'failed'" class="absolute inset-0 flex items-center justify-center bg-st-errorBg/80 text-st-error" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l9 16H3zM12 10v4M12 17h.01" /></svg>
      </span>
      <span v-else-if="playable" class="absolute left-1/2 top-1/2 -ml-[15px] -mt-[15px] flex h-[30px] w-[30px] items-center justify-center rounded-full bg-black/55" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
      </span>
    </button>

    <div class="flex min-w-0 flex-1 flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <span class="st-badge" :class="look.cls">{{ look.label }}</span>
        <span class="min-w-0 flex-1 basis-[60px] truncate text-xs st-dim">{{ origin }}</span>
        <span v-if="score" class="st-badge !bg-st-accentBg !font-extrabold !text-st-accentText" :aria-label="`Note : ${score} sur 10`">{{ score }} / 10</span>
      </div>
      <button type="button" class="m-0 line-clamp-3 border-0 bg-transparent p-0 text-left text-[15px] font-bold leading-[21px] text-st-text" @click="emit('open')">{{ clip.title || clip.hook || 'Clip sans titre' }}</button>
      <div class="flex flex-wrap items-center gap-2 text-[13px] text-st-soft">
        <span>{{ duration }}<template v-if="clip.category"> · {{ clip.category }}</template></span>
        <span v-if="hasIssue && state !== 'failed'" class="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-st-warnBg px-2 text-xs font-bold text-st-warn">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 6v8M12 18h.01" /></svg>À vérifier
        </span>
      </div>
      <div v-if="pubLine" class="text-[13px] leading-5 text-st-soft">{{ pubLine }}</div>
      <div v-if="state === 'rendering'" class="flex flex-col gap-1.5">
        <div role="status" class="text-[13px] text-st-info">Préparation du clip…<template v-if="clip.progress != null"> {{ clip.progress }} %</template></div>
        <div class="h-1.5 overflow-hidden rounded-[3px] bg-st-raised2" role="progressbar" aria-label="Avancement de la préparation" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="clip.progress ?? undefined"><div class="st-bar h-full" :class="clip.progress == null ? 'st-bar-live' : ''" :style="{ width: `${clip.progress ?? 40}%`, background: 'var(--st-info)' }" /></div>
      </div>
      <p v-if="state === 'failed'" class="m-0 text-[13px] leading-5 text-st-error">Le rendu a échoué. Tu peux réessayer.</p>

      <div class="mt-auto flex flex-wrap items-center gap-2">
        <template v-if="state === 'review'">
          <button type="button" class="st-btn" :disabled="studio.busy.value" @click="approve">Approuver</button>
          <button type="button" class="st-btn-ghost" :disabled="studio.busy.value" @click="refuse">Refuser</button>
        </template>
        <template v-else-if="state === 'approved'">
          <button type="button" class="st-btn" @click="emit('open')">Publier…</button>
          <a v-if="clip.videoUrl" :href="clip.videoUrl" :download="`${(clip.title || 'clip').replace(/[^\w-]+/g, '_')}.mp4`" class="st-btn-ghost no-underline">Télécharger</a>
        </template>
        <button v-else-if="state === 'rejected'" type="button" class="st-btn-ghost" :disabled="studio.busy.value" @click="reopen">Remettre à valider</button>
        <button v-else-if="state === 'failed'" type="button" class="st-btn" :disabled="studio.busy.value" @click="retry">Réessayer le rendu</button>
        <a v-else-if="state === 'published' && clip.videoUrl" :href="clip.videoUrl" :download="`${(clip.title || 'clip').replace(/[^\w-]+/g, '_')}.mp4`" class="st-btn-ghost no-underline">Télécharger</a>
        <button type="button" class="st-btn-quiet" @click="emit('open')">Détails<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
      </div>
    </div>
  </article>
</template>
