<script setup lang="ts">
// Back-office du streamer : validation des lots de 4 clips, direction artistique, reglages, fichiers, banque de reference.
// Le mot de passe reste en memoire (jamais dans l'URL ni dans le stockage du navigateur) et part dans l'en-tete x-admin-password.
useHead({ title: 'Studio Clippeak' })

interface Channel { id: string, login: string, displayName: string, autoClip: boolean }
interface Clip {
  id: string, batch: number | null, status: string, title: string | null, caption: string | null, hashtags: string | null
  error: string | null, qc: { passed: boolean, issues: Array<{ severity: string, message: string }> } | null
  illustrations: Array<{ path: string, source: string }> | null, reviewNote: string | null, score: number | null
  kind: string | null, category: string | null, hook: string | null, rationale: string | null, scorer: string | null, channel: string, videoUrl: string | null
}

const password = ref('')
const connected = ref(false)
const error = ref('')
const notice = ref('')
const busy = ref(false)
const tab = ref<'reference' | 'clips' | 'da' | 'reglages' | 'fichiers'>('reference')

const channels = ref<Channel[]>([])
const channelId = ref('')
const detail = ref<any>(null)
const clips = ref<Clip[]>([])
const clipStatus = ref('review')
const drafts = reactive<Record<string, { caption: string, title: string, note: string }>>({})

const keywordsText = ref('')
const namesText = ref('')
const uploadKind = ref('photo')
const uploadTags = ref('')
const uploadSource = ref('')
const uploadInput = ref<HTMLInputElement | null>(null)

const headers = computed(() => ({ 'x-admin-password': password.value.trim() }))

async function api<T>(url: string, options: Record<string, any> = {}): Promise<T> {
  try {
    return await $fetch<T>(url, { ...options, headers: { ...headers.value, ...(options.headers ?? {}) } })
  } catch (e: any) {
    throw new Error(e?.data?.statusMessage || e?.statusMessage || 'Requete refusee')
  }
}

async function run(task: () => Promise<void>, success = '') {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await task()
    if (success) notice.value = success
  } catch (e: any) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

const connect = () => run(async () => {
  const data = await api<{ channels: Channel[] }>('/api/studio/channels')
  channels.value = data.channels
  connected.value = true
  channelId.value = data.channels[0]?.id ?? ''
  await Promise.all([loadChannel(), loadClips()])
})

async function loadChannel() {
  if (!channelId.value) return
  detail.value = await api(`/api/studio/channels/${channelId.value}`)
  keywordsText.value = (detail.value.settings?.keywords ?? []).join(', ')
  namesText.value = (detail.value.style.names ?? []).join(', ')
  await loadBank()
}

async function loadClips() {
  const data = await api<{ clips: Clip[] }>('/api/studio/clips', { query: { status: clipStatus.value } })
  clips.value = data.clips
  for (const clip of data.clips) {
    drafts[clip.id] ??= { caption: clip.caption ?? '', title: clip.title ?? '', note: '' }
  }
}

const batches = computed(() => {
  const groups = new Map<number, Clip[]>()
  for (const clip of clips.value) groups.set(clip.batch ?? 0, [...(groups.get(clip.batch ?? 0) ?? []), clip])
  return [...groups.entries()].map(([batch, items]) => ({ batch, items }))
})

const review = (clip: Clip, action: 'approve' | 'reject' | 'requeue') => run(async () => {
  const draft = drafts[clip.id]
  const body = action === 'approve' ? { action, caption: draft.caption, note: draft.note || undefined }
    : action === 'reject' ? { action, note: draft.note || undefined }
      : { action, title: draft.title || undefined, replan: true, note: draft.note || undefined }
  await api(`/api/studio/clips/${clip.id}/review`, { method: 'POST', body })
  await loadClips()
}, action === 'approve' ? 'Clip approuve. Rien n\'a ete publie.' : action === 'reject' ? 'Clip refuse.' : 'Clip remis en file pour un nouveau rendu.')

const saveSettings = () => run(async () => {
  const s = detail.value.settings
  await api(`/api/studio/channels/${channelId.value}/settings`, {
    method: 'PUT',
    body: { ...s, keywords: keywordsText.value.split(',').map((k: string) => k.trim()).filter(Boolean) }
  })
  await loadChannel()
}, 'Reglages enregistres.')

const saveStyle = () => run(async () => {
  const style = { ...detail.value.style, names: namesText.value.split(',').map((n: string) => n.trim()).filter(Boolean) }
  await api(`/api/studio/channels/${channelId.value}/style`, { method: 'PUT', body: style })
  await loadChannel()
}, 'Direction artistique enregistree.')

const upload = () => run(async () => {
  const file = uploadInput.value?.files?.[0]
  if (!file) throw new Error('Choisissez un fichier')
  const form = new FormData()
  form.append('kind', uploadKind.value)
  form.append('tags', uploadTags.value)
  form.append('source', uploadSource.value)
  form.append('file', file)
  await api(`/api/studio/channels/${channelId.value}/assets`, { method: 'POST', body: form })
  if (uploadInput.value) uploadInput.value.value = ''
  uploadTags.value = ''
  uploadSource.value = ''
  await loadChannel()
}, 'Fichier ajoute.')

const removeAsset = (id: string) => run(async () => {
  await api(`/api/studio/assets/${id}`, { method: 'DELETE' })
  await loadChannel()
}, 'Fichier supprime.')


const bank = ref<any>(null)
const refUrls = ref('')
const refInput = ref<HTMLInputElement | null>(null)
const statLabels = [['viewCount', 'Vues'], ['likeCount', 'Likes'], ['commentCount', 'Commentaires'], ['shareCount', 'Partages']] as const
const statusLabel: Record<string, string> = { pending: 'En attente', processing: 'Analyse en cours', done: 'Analyse', failed: 'Echec' }

async function loadBank() {
  if (!channelId.value) return
  bank.value = await api(`/api/studio/channels/${channelId.value}/references`)
}

const addReferences = () => run(async () => {
  const form = new FormData()
  for (const file of Array.from(refInput.value?.files ?? [])) form.append('files', file)
  form.append('urls', refUrls.value)
  const r = await api<any>(`/api/studio/channels/${channelId.value}/references`, { method: 'POST', body: form })
  if (refInput.value) refInput.value.value = ''
  refUrls.value = ''
  await loadBank()
  const problems = [...r.rejectedLinks.map((u: string) => `lien refuse : ${u}`), ...r.refusedFiles]
  notice.value = `${r.addedFiles} fichier(s) et ${r.addedLinks} lien(s) ajoute(s)${r.duplicateLinks ? ` (${r.duplicateLinks} deja present(s))` : ''}. L'analyse demarre au prochain passage du worker.`
  if (problems.length) error.value = problems.join(' · ')
})

const saveStat = (item: any, field: string, raw: string) => run(async () => {
  const value = raw.trim() === '' ? null : Number(raw.replace(/\s/g, '').replace(',', '.'))
  if (value !== null && !Number.isFinite(value)) throw new Error('Nombre invalide')
  await api(`/api/studio/references/${item.id}`, { method: 'PATCH', body: { [field]: value } })
  await loadBank()
})

const removeReference = (id: string) => run(async () => {
  await api(`/api/studio/references/${id}`, { method: 'DELETE' })
  await loadBank()
}, 'Element supprime.')

// Apercu en direct de la direction artistique : memes positions et proportions que le rendu 1080x1920, a l'echelle 1/4.
const PREVIEW_W = 270
const PREVIEW_H = 480
const PREVIEW_SCALE = PREVIEW_W / 1080
const previewIllustration = ref(false)
const introScale = ref(1)
const introAnimating = ref(false)
const subtitleSample = ['on a tout', 'vu']

const sceneStyle = computed(() => {
  const f = detail.value?.style.framing
  if (!f) return {}
  // Meme calcul que le rendu : la source 16:9 est agrandie par le zoom, puis recadree sur le point choisi sans sortir de l'image.
  const h = PREVIEW_H * Math.max(1, f.zoom)
  const w = (h * 16) / 9
  const left = Math.min(0, Math.max(PREVIEW_W - w, PREVIEW_W / 2 - f.centerX * w))
  const top = Math.min(0, Math.max(PREVIEW_H - h, PREVIEW_H / 2 - f.centerY * h))
  return { position: 'absolute', width: `${w}px`, height: `${h}px`, left: `${left}px`, top: `${top}px`, background: 'linear-gradient(135deg,#312e81,#0f172a 55%,#064e3b)' }
})

const figureStyle = {
  position: 'absolute', left: '50%', top: '28%', height: '56%', aspectRatio: '0.8', transform: 'translateX(-50%)',
  borderRadius: '45% 45% 8% 8%', background: 'linear-gradient(#fbbf24 0 34%, #475569 34%)', opacity: '0.9'
}

const introStyle = computed(() => ({
  position: 'absolute', inset: '0', transformOrigin: 'center', transform: `scale(${introScale.value})`,
  transition: introAnimating.value ? `transform ${detail.value?.style.zoomIntro.durationSec ?? 0.6}s ease-out` : 'none'
}))

function replayIntro() {
  introAnimating.value = false
  introScale.value = 1 + (detail.value?.style.zoomIntro.amount ?? 0)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    introAnimating.value = true
    introScale.value = 1
  }))
}

const illustrationStyle = {
  position: 'absolute', left: '0', width: '100%', top: `${300 * PREVIEW_SCALE}px`, height: `${800 * PREVIEW_SCALE}px`,
  background: 'repeating-linear-gradient(45deg,#334155,#334155 10px,#1e293b 10px,#1e293b 20px)', color: '#e2e8f0',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px'
}

const bandStyle = {
  position: 'absolute', left: '0', top: '0', width: '100%', height: `${300 * PREVIEW_SCALE}px`, background: '#000',
  display: 'flex', alignItems: 'center', justifyContent: 'center'
}

const titleTextStyle = computed(() => {
  const t = detail.value?.style.title
  if (!t) return {}
  return {
    fontFamily: `"${t.fontName}", sans-serif`, fontWeight: '700', fontSize: `${t.fontSize * PREVIEW_SCALE}px`, lineHeight: '1.15',
    color: detail.value?.settings?.accentColor || t.color || '#fff', textAlign: 'center',
    // Le rendu coupe a 24 caracteres par ligne et au nombre de lignes choisi.
    maxWidth: `${Math.min(PREVIEW_W - 12, 24 * 0.52 * t.fontSize * PREVIEW_SCALE)}px`,
    display: '-webkit-box', WebkitLineClamp: String(t.maxLines), WebkitBoxOrient: 'vertical', overflow: 'hidden'
  }
})

const subtitleBoxStyle = { position: 'absolute', left: '0', width: '100%', bottom: `${420 * PREVIEW_SCALE}px`, textAlign: 'center' }

const subtitleTextStyle = computed(() => {
  const s = detail.value?.style.subtitles
  if (!s) return {}
  return {
    fontFamily: `"${s.fontName}", sans-serif`, fontWeight: '800', fontSize: `${s.fontSize * PREVIEW_SCALE}px`, color: s.color,
    textTransform: s.uppercase ? 'uppercase' : 'none', textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000'
  }
})

const avatarStyle = computed(() => {
  const o = detail.value?.style.overlay
  if (!o) return {}
  return {
    position: 'absolute', left: `${o.x * PREVIEW_SCALE}px`, top: `${o.y * PREVIEW_SCALE}px`, width: `${o.width * PREVIEW_SCALE}px`, height: `${o.width * PREVIEW_SCALE}px`,
    border: '1px dashed #fff', background: 'rgba(255,255,255,.2)', color: '#fff', fontSize: '10px',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  }
})

const assetsOf = (kind: string) => (detail.value?.assets ?? []).filter((a: any) => a.kind === kind)
const fieldClass = 'h-11 w-full rounded-xl border border-white/15 bg-black/35 px-3 text-sm outline-none focus:border-clippeak-violet'
const buttonClass = 'rounded-xl bg-clippeak-violet px-5 py-2.5 text-sm font-semibold transition hover:bg-clippeak-violetLight disabled:opacity-60'
const ghostClass = 'rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold transition hover:border-white/50 disabled:opacity-60'
</script>

<template>
  <main class="mx-auto min-h-screen w-full max-w-6xl px-5 py-10 sm:px-8">
    <section class="card-surface p-6 sm:p-8">
      <h1 class="font-display text-3xl font-bold">Studio Clippeak</h1>
      <p class="mt-2 text-sm text-clippeak-muted">
        Validez vos clips par lots de 4 et reglez votre direction artistique. Rien n'est publie ni paye par Clippeak : approuver un clip le marque seulement comme valide.
      </p>
      <form v-if="!connected" class="mt-6 flex flex-col gap-3 sm:flex-row" @submit.prevent="connect">
        <input v-model="password" type="password" autocomplete="current-password" placeholder="Mot de passe admin" :class="fieldClass">
        <button type="submit" :class="buttonClass" :disabled="busy || !password">Se connecter</button>
      </form>
      <p v-if="error" class="mt-4 text-sm font-semibold text-red-400" role="alert">{{ error }}</p>
      <p v-if="notice" class="mt-4 text-sm font-semibold text-emerald-300" role="status">{{ notice }}</p>
    </section>

    <template v-if="connected">
      <div class="mt-6 flex flex-wrap items-center gap-3">
        <select v-model="channelId" :class="[fieldClass, 'max-w-xs']" aria-label="Streamer" @change="run(loadChannel)">
          <option v-for="c in channels" :key="c.id" :value="c.id">{{ c.displayName }}</option>
        </select>
        <nav class="flex flex-wrap gap-2" aria-label="Sections">
          <button v-for="t in [['reference', '1. Clips de reference'], ['clips', 'Lots a valider'], ['da', 'Direction artistique'], ['reglages', 'Mots-cles et durees'], ['fichiers', 'Fichiers']]" :key="t[0]"
                  type="button" :class="[ghostClass, tab === t[0] ? 'border-clippeak-violet bg-clippeak-violet/20' : '']" @click="tab = t[0] as any">
            {{ t[1] }}
          </button>
        </nav>
      </div>

      <!-- Lots a valider -->
      <section v-if="tab === 'clips'" class="mt-6 space-y-6">
        <div class="flex items-center gap-3">
          <label class="text-sm text-clippeak-muted" for="status">Statut</label>
          <select id="status" v-model="clipStatus" :class="[fieldClass, 'max-w-[12rem]']" @change="run(loadClips)">
            <option value="review">A valider</option>
            <option value="approved">Approuves</option>
            <option value="rejected">Refuses</option>
            <option value="failed">En echec</option>
            <option value="queued">En file</option>
            <option value="rendering">En rendu</option>
          </select>
          <button type="button" :class="ghostClass" :disabled="busy" @click="run(loadClips)">Actualiser</button>
        </div>
        <p v-if="!clips.length" class="text-sm text-clippeak-muted">Aucun clip pour ce statut.</p>
        <div v-for="group in batches" :key="group.batch" class="card-surface p-5">
          <h2 class="font-display text-xl font-bold">Lot {{ group.batch || '-' }}</h2>
          <div class="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <article v-for="clip in group.items" :key="clip.id" class="flex flex-col gap-3">
              <video v-if="clip.videoUrl" :src="clip.videoUrl" controls playsinline preload="metadata" class="aspect-[9/16] w-full rounded-xl bg-black" />
              <div v-else class="flex aspect-[9/16] w-full items-center justify-center rounded-xl bg-black/50 p-3 text-center text-xs text-clippeak-muted">
                {{ clip.error || 'Pas encore de video' }}
              </div>
              <p class="text-sm font-semibold">{{ clip.title || clip.hook || 'Sans titre' }}</p>
              <p class="text-xs text-clippeak-muted">Note {{ clip.score ?? '-' }}/10 · {{ clip.kind || '-' }} · {{ clip.category || '-' }}</p>
              <p v-if="clip.rationale" class="rounded-lg bg-white/5 p-2 text-xs"><strong>Pourquoi cette note :</strong> {{ clip.rationale }}<span v-if="clip.scorer" class="text-clippeak-muted"> ({{ clip.scorer === 'claude' ? 'notee par IA' : 'note locale' }})</span></p>
              <ul v-if="clip.qc?.issues?.length" class="space-y-1 text-xs">
                <li v-for="(issue, i) in clip.qc.issues" :key="i" :class="issue.severity === 'error' ? 'text-red-400' : 'text-amber-300'">{{ issue.message }}</li>
              </ul>
              <ul v-if="clip.illustrations?.length" class="space-y-1 text-xs text-clippeak-muted">
                <li v-for="(ill, i) in clip.illustrations" :key="i">Illustration : {{ ill.source }}</li>
              </ul>
              <template v-if="drafts[clip.id]">
                <label class="text-xs text-clippeak-muted" :for="`cap-${clip.id}`">Legende</label>
                <textarea :id="`cap-${clip.id}`" v-model="drafts[clip.id].caption" rows="4" class="w-full rounded-xl border border-white/15 bg-black/35 p-2 text-xs outline-none focus:border-clippeak-violet" />
                <input v-model="drafts[clip.id].title" placeholder="Nouveau titre (nouveau rendu)" :class="fieldClass">
                <input v-model="drafts[clip.id].note" placeholder="Note (facultatif)" :class="fieldClass">
              </template>
              <div v-if="clip.status === 'review'" class="flex flex-wrap gap-2">
                <button type="button" :class="buttonClass" :disabled="busy" @click="review(clip, 'approve')">Approuver</button>
                <button type="button" :class="ghostClass" :disabled="busy" @click="review(clip, 'reject')">Refuser</button>
                <button type="button" :class="ghostClass" :disabled="busy" @click="review(clip, 'requeue')">Refaire</button>
              </div>
              <button v-else-if="['failed', 'rejected'].includes(clip.status)" type="button" :class="ghostClass" :disabled="busy" @click="review(clip, 'requeue')">Refaire</button>
            </article>
          </div>
        </div>
      </section>

      <!-- Direction artistique : reglages a gauche, apercu en direct a droite -->
      <section v-if="tab === 'da' && detail" class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div class="card-surface space-y-6 p-6">
          <fieldset class="space-y-3">
            <legend class="font-semibold">Titre (bande noire en haut)</legend>
            <label class="flex items-center gap-2 text-sm"><input v-model="detail.style.title.enabled" type="checkbox"> Afficher le titre</label>
            <template v-if="detail.style.title.enabled">
              <input v-model="detail.style.title.fontName" aria-label="Police du titre" placeholder="Police (ex : Lato)" :class="fieldClass">
              <label class="text-sm text-clippeak-muted">Taille {{ detail.style.title.fontSize }}
                <input v-model.number="detail.style.title.fontSize" type="range" min="30" max="120" class="w-full">
              </label>
              <label class="text-sm text-clippeak-muted">Lignes maximum <input v-model.number="detail.style.title.maxLines" type="number" min="1" max="3" :class="fieldClass"></label>
            </template>
          </fieldset>

          <fieldset class="space-y-3">
            <legend class="font-semibold">Sous-titres mot par mot</legend>
            <label class="flex items-center gap-2 text-sm"><input v-model="detail.style.subtitles.enabled" type="checkbox"> Afficher les sous-titres</label>
            <template v-if="detail.style.subtitles.enabled">
              <label class="flex items-center gap-2 text-sm"><input v-model="detail.style.subtitles.uppercase" type="checkbox"> Majuscules</label>
              <input v-model="detail.style.subtitles.fontName" aria-label="Police des sous-titres" :class="fieldClass">
              <label class="text-sm text-clippeak-muted">Taille {{ detail.style.subtitles.fontSize }}
                <input v-model.number="detail.style.subtitles.fontSize" type="range" min="40" max="160" class="w-full">
              </label>
            </template>
          </fieldset>

          <fieldset class="space-y-3">
            <legend class="font-semibold">Zoom d'ouverture</legend>
            <label class="flex items-center gap-2 text-sm"><input v-model="detail.style.zoomIntro.enabled" type="checkbox"> Zoom au debut du clip</label>
            <template v-if="detail.style.zoomIntro.enabled">
              <label class="text-sm text-clippeak-muted">Amplitude {{ detail.style.zoomIntro.amount }}
                <input v-model.number="detail.style.zoomIntro.amount" type="range" step="0.01" min="0" max="0.4" class="w-full">
              </label>
            </template>
          </fieldset>

          <fieldset class="space-y-3">
            <legend class="font-semibold">Bruitages</legend>
            <label class="flex items-center gap-2 text-sm"><input v-model="detail.style.sfx.enabled" type="checkbox"> Ajouter des bruitages</label>
            <template v-if="detail.style.sfx.enabled">
              <label class="text-sm text-clippeak-muted">Volume {{ detail.style.sfx.volume }}
                <input v-model.number="detail.style.sfx.volume" type="range" step="0.05" min="0" max="1" class="w-full">
              </label>
              <div v-for="situation in detail.sounds.situations" :key="situation.id" class="space-y-2 rounded-xl border border-white/10 p-3">
                <label class="flex items-center gap-2 text-sm">
                  <input v-model="detail.style.sfx[situation.id].enabled" type="checkbox"> {{ situation.label }}
                </label>
                <select v-if="detail.style.sfx[situation.id].enabled" v-model="detail.style.sfx[situation.id].sound" :aria-label="`Bruitage : ${situation.label}`" :class="fieldClass">
                  <optgroup label="Sons integres">
                    <option v-for="s in detail.sounds.builtin" :key="s.id" :value="s.id">{{ s.label }}</option>
                  </optgroup>
                  <optgroup v-if="assetsOf('sfx').length" label="Vos fichiers (onglet Fichiers)">
                    <option v-for="a in assetsOf('sfx')" :key="a.id" :value="`asset:${a.id}`">{{ a.filename }}</option>
                  </optgroup>
                </select>
              </div>
              <p class="text-xs text-clippeak-muted">Chaque situation a son propre son. Les sons ne s'entendent pas dans l'apercu : ils sont ajoutes au rendu du clip.</p>
            </template>
          </fieldset>

          <fieldset class="space-y-3">
            <legend class="font-semibold">Cadrage du streamer</legend>
            <label class="flex items-center gap-2 text-sm"><input v-model="detail.style.framing.auto" type="checkbox"> Cadrage automatique (reconnaissance du visage avec vos photos)</label>
            <p v-if="detail.style.framing.auto" class="text-xs text-clippeak-muted">3 a 5 photos nettes suffisent (onglet Fichiers). Si vous n'etes pas reconnu dans le clip, le cadrage manuel ci-dessous est utilise et un avertissement apparait dans le controle qualite.</p>
            <label class="text-sm text-clippeak-muted">{{ detail.style.framing.auto ? 'Repli : position' : 'Position' }} horizontale {{ detail.style.framing.centerX }}
              <input v-model.number="detail.style.framing.centerX" type="range" step="0.05" min="0" max="1" class="w-full">
            </label>
            <label class="text-sm text-clippeak-muted">Position verticale {{ detail.style.framing.centerY }}
              <input v-model.number="detail.style.framing.centerY" type="range" step="0.05" min="0" max="1" class="w-full">
            </label>
            <label class="text-sm text-clippeak-muted">Zoom {{ detail.style.framing.zoom }} (1 = plan large, 3 = gros plan)
              <input v-model.number="detail.style.framing.zoom" type="range" step="0.1" min="1" max="3" class="w-full">
            </label>
          </fieldset>

          <fieldset class="space-y-3">
            <legend class="font-semibold">Avatar / GIF</legend>
            <label class="flex items-center gap-2 text-sm"><input v-model="detail.style.overlay.enabled" type="checkbox"> Afficher l'avatar</label>
            <template v-if="detail.style.overlay.enabled">
              <select v-model="detail.style.overlay.assetId" aria-label="Fichier avatar" :class="fieldClass">
                <option :value="null">Aucun fichier</option>
                <option v-for="a in assetsOf('avatar')" :key="a.id" :value="a.id">{{ a.filename }}</option>
              </select>
              <select v-model="detail.style.overlay.appear" aria-label="Apparition" :class="fieldClass">
                <option value="always">Tout le clip</option>
                <option value="intro">3 premieres secondes</option>
                <option value="outro">3 dernieres secondes</option>
              </select>
              <label class="text-sm text-clippeak-muted">Position horizontale {{ detail.style.overlay.x }}
                <input v-model.number="detail.style.overlay.x" type="range" step="10" min="0" max="1080" class="w-full">
              </label>
              <label class="text-sm text-clippeak-muted">Position verticale {{ detail.style.overlay.y }}
                <input v-model.number="detail.style.overlay.y" type="range" step="10" min="0" max="1920" class="w-full">
              </label>
              <label class="text-sm text-clippeak-muted">Largeur {{ detail.style.overlay.width }}
                <input v-model.number="detail.style.overlay.width" type="range" step="10" min="40" max="600" class="w-full">
              </label>
            </template>
          </fieldset>

          <fieldset class="space-y-3">
            <legend class="font-semibold">Illustrations et noms propres</legend>
            <label class="flex items-center gap-2 text-sm"><input v-model="detail.style.illustrations.enabled" type="checkbox"> Illustrations en ecran scinde (depuis vos videos deposees)</label>
            <label v-if="detail.style.illustrations.enabled" class="text-sm text-clippeak-muted">Illustrations par clip (maximum) {{ detail.style.illustrations.maxPerClip }}
              <input v-model.number="detail.style.illustrations.maxPerClip" type="range" min="0" max="4" class="w-full">
            </label>
            <label class="text-sm text-clippeak-muted">Noms a ecrire exactement (separes par des virgules)
              <input v-model="namesText" placeholder="Yassencore, Thanos" :class="fieldClass">
            </label>
          </fieldset>

          <button type="button" :class="buttonClass" :disabled="busy" @click="saveStyle">Enregistrer la direction artistique</button>
        </div>

        <!-- Apercu en direct : memes positions et proportions que le rendu 1080x1920, a l'echelle 1/4 -->
        <aside class="lg:sticky lg:top-6 lg:self-start">
          <div class="card-surface space-y-3 p-4">
            <h3 class="font-semibold">Apercu en direct</h3>
            <div class="mx-auto overflow-hidden rounded-xl bg-black" :style="{ width: PREVIEW_W + 'px', height: PREVIEW_H + 'px', position: 'relative' }" aria-label="Apercu du rendu">
              <div :style="introStyle">
                <div :style="sceneStyle">
                  <div :style="figureStyle" />
                </div>
              </div>
              <div v-if="previewIllustration" :style="illustrationStyle">Illustration</div>
              <div v-if="detail.style.title.enabled" :style="bandStyle">
                <span :style="titleTextStyle">Il a vraiment dit ca en direct devant tout le monde</span>
              </div>
              <div v-else :style="{ position: 'absolute', left: 0, top: 0, width: '100%', height: 300 * PREVIEW_SCALE + 'px', background: '#000' }" />
              <div v-if="detail.style.subtitles.enabled" :style="subtitleBoxStyle">
                <span :style="subtitleTextStyle">{{ subtitleSample[0] }} <span :style="{ color: detail.settings?.highlightColor || '#FFD400' }">{{ subtitleSample[1] }}</span></span>
              </div>
              <div v-if="detail.style.overlay.enabled" :style="avatarStyle">Avatar</div>
            </div>
            <label class="flex items-center gap-2 text-sm"><input v-model="previewIllustration" type="checkbox"> Montrer une illustration</label>
            <button v-if="detail.style.zoomIntro.enabled" type="button" :class="ghostClass" @click="replayIntro">Rejouer le zoom d'ouverture</button>
            <p class="text-xs text-clippeak-muted">
              Apercu fidele pour les positions, tailles, couleurs et lignes ; l'image est un decor type (le rendu utilise votre video) et les polices peuvent differer legerement.
            </p>
          </div>
        </aside>
      </section>

      <!-- Reglages -->
      <section v-if="tab === 'reglages' && detail?.settings" class="card-surface mt-6 space-y-4 p-6">
        <label class="block text-sm text-clippeak-muted">Mots-cles du chat (separes par des virgules)
          <textarea v-model="keywordsText" rows="3" class="mt-1 w-full rounded-xl border border-white/15 bg-black/35 p-3 text-sm outline-none focus:border-clippeak-violet" />
        </label>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="text-sm text-clippeak-muted">Duree minimale (s) <input v-model.number="detail.settings.clipMinSec" type="number" min="10" max="120" :class="fieldClass"></label>
          <label class="text-sm text-clippeak-muted">Duree maximale (s) <input v-model.number="detail.settings.clipMaxSec" type="number" min="15" max="180" :class="fieldClass"></label>
          <label class="text-sm text-clippeak-muted">Couleur du titre <input v-model="detail.settings.accentColor" type="color" :class="fieldClass"></label>
          <label class="text-sm text-clippeak-muted">Couleur des mots-cles <input v-model="detail.settings.highlightColor" type="color" :class="fieldClass"></label>
        </div>
        <label class="flex items-center gap-2 text-sm"><input v-model="detail.settings.subtitles" type="checkbox"> Sous-titres actives</label>
        <button type="button" :class="buttonClass" :disabled="busy" @click="saveSettings">Enregistrer les reglages</button>
      </section>

      <!-- Fichiers -->
      <section v-if="tab === 'fichiers' && detail" class="card-surface mt-6 space-y-5 p-6">
        <p class="text-sm text-clippeak-muted">
          Photos (reconnaissance, 3 a 5 suffisent), avatar ou GIF, SFX, polices et videos d'illustration. Chaque illustration garde sa source.
        </p>
        <form class="grid gap-3 sm:grid-cols-2" @submit.prevent="upload">
          <select v-model="uploadKind" aria-label="Type de fichier" :class="fieldClass">
            <option value="photo">Photo du streamer</option>
            <option value="avatar">Avatar / GIF</option>
            <option value="sfx">SFX</option>
            <option value="illustration">Video d'illustration</option>
            <option value="font">Police</option>
          </select>
          <input ref="uploadInput" type="file" aria-label="Fichier" class="text-sm">
          <input v-model="uploadTags" placeholder="Mots-cles (virgules) : marche, legumes" :class="fieldClass">
          <input v-model="uploadSource" placeholder="Source ou credit (illustrations)" :class="fieldClass">
          <button type="submit" :class="buttonClass" :disabled="busy">Ajouter</button>
        </form>
        <ul class="divide-y divide-white/10 text-sm">
          <li v-for="a in detail.assets" :key="a.id" class="flex items-center justify-between gap-3 py-2">
            <span><strong>{{ a.kind }}</strong> · {{ a.filename }} <span class="text-clippeak-muted">{{ a.tags.join(', ') }} {{ a.source ? '· ' + a.source : '' }}</span></span>
            <button type="button" :class="ghostClass" :disabled="busy" @click="removeAsset(a.id)">Supprimer</button>
          </li>
          <li v-if="!detail.assets.length" class="py-2 text-clippeak-muted">Aucun fichier.</li>
        </ul>
      </section>

      <!-- Banque de reference : base de tout le reste -->
      <section v-if="tab === 'reference'" class="mt-6 space-y-6">
        <div class="card-surface space-y-4 p-6">
          <h2 class="font-display text-xl font-bold">Clips de reference</h2>
          <p class="text-sm text-clippeak-muted">
            Deposez des clips qui ont bien marche (videos) ou collez des liens : clips YouTube Shorts / TikTok / Instagram, ou un compte entier
            (les derniers clips sont alors recuperes). Clippeak transcrit chaque clip, en regarde des images cles et en tire ce qui le fait marcher.
            Pendant un live ou sur une VOD, tout moment qui ressemble a ces clips est propose en clip. Les statistiques sont facultatives.
          </p>
          <form class="space-y-3" @submit.prevent="addReferences">
            <input ref="refInput" type="file" multiple accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" aria-label="Videos de reference" class="text-sm">
            <textarea v-model="refUrls" rows="4" aria-label="Liens" placeholder="Un lien par ligne : clip ou compte YouTube / TikTok / Instagram (20 maximum a la fois)" class="w-full rounded-xl border border-white/15 bg-black/35 p-3 text-sm outline-none focus:border-clippeak-violet" />
            <button type="submit" :class="buttonClass" :disabled="busy">Ajouter a la banque</button>
          </form>
        </div>

        <div v-if="bank" class="card-surface space-y-4 p-6">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h3 class="font-semibold">Ce que Clippeak a retenu</h3>
            <button type="button" :class="ghostClass" :disabled="busy" @click="run(loadBank)">Actualiser{{ bank.pending ? ` (${bank.pending} en cours)` : '' }}</button>
          </div>
          <p class="text-sm">{{ bank.profile.analyzedCount }} clip(s) analyse(s) sur {{ bank.profile.clipCount }} · {{ bank.profile.withStats }} avec statistiques</p>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 class="text-sm font-semibold">Sujets</h4>
              <p class="mt-1 text-sm text-clippeak-muted">{{ bank.profile.topics.map((t: any) => t.word).join(', ') || '-' }}</p>
            </div>
            <div>
              <h4 class="text-sm font-semibold">Formats et emotions</h4>
              <p class="mt-1 text-sm text-clippeak-muted">
                {{ bank.profile.formats.map((f: any) => `${f.name} (${f.count})`).join(', ') || '-' }} ·
                {{ bank.profile.emotions.map((f: any) => `${f.name} (${f.count})`).join(', ') || '-' }}
              </p>
            </div>
          </div>
          <div v-if="bank.profile.hooks.length">
            <h4 class="text-sm font-semibold">Accroches</h4>
            <ul class="mt-1 list-disc pl-5 text-sm text-clippeak-muted"><li v-for="h in bank.profile.hooks" :key="h.id">{{ h.hook }}</li></ul>
          </div>
        </div>

        <ul v-if="bank" class="space-y-3">
          <li v-for="item in bank.items" :key="item.id" class="card-surface space-y-2 p-4 text-sm">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>{{ item.kind === 'account' ? 'Compte' : 'Clip' }}</strong> · {{ item.source }} · {{ item.title || item.url || 'sans titre' }}
                <span class="text-clippeak-muted">· {{ statusLabel[item.status] ?? item.status }}</span>
              </span>
              <button type="button" :class="ghostClass" :disabled="busy" @click="removeReference(item.id)">Supprimer</button>
            </div>
            <p v-if="item.error" class="text-red-400">{{ item.error }}</p>
            <p v-if="item.note" class="text-clippeak-muted">{{ item.note }}</p>
            <template v-if="item.analysis">
              <p>{{ item.analysis.summary }}</p>
              <p class="text-clippeak-muted">
                {{ item.analysis.format }} · {{ item.analysis.emotion }} · {{ item.analysis.category }} — {{ item.analysis.whyItWorks }}
                <span v-if="item.analysis.analyzer === 'local'">(analyse simplifiee, sans l'IA)</span>
              </p>
            </template>
            <div v-if="item.kind === 'clip'" class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label v-for="s in statLabels" :key="s[0]" class="text-xs text-clippeak-muted">
                {{ s[1] }} (facultatif)
                <input :value="item[s[0]] ?? ''" inputmode="numeric" :class="fieldClass" @change="saveStat(item, s[0], ($event.target as HTMLInputElement).value)">
              </label>
            </div>
          </li>
          <li v-if="!bank.items.length" class="text-sm text-clippeak-muted">Aucun clip de reference pour l'instant.</li>
        </ul>
      </section>
    </template>
  </main>
</template>
