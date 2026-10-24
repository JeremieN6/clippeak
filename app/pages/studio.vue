<script setup lang="ts">
// Back-office du streamer : validation des lots de 4 clips, direction artistique, reglages, fichiers, banque de reference.
// Le mot de passe reste en memoire (jamais dans l'URL ni dans le stockage du navigateur) et part dans l'en-tete x-admin-password.
useHead({ title: 'Studio Clippeak' })

interface Channel { id: string, login: string, displayName: string, autoClip: boolean }
interface Clip {
  id: string, batch: number | null, status: string, title: string | null, caption: string | null, hashtags: string | null
  error: string | null, qc: { passed: boolean, issues: Array<{ severity: string, message: string }> } | null
  illustrations: Array<{ path: string, source: string }> | null, reviewNote: string | null, score: number | null
  kind: string | null, category: string | null, hook: string | null, channel: string, videoUrl: string | null
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

      <!-- Direction artistique -->
      <section v-if="tab === 'da' && detail" class="card-surface mt-6 space-y-6 p-6">
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="space-y-3">
            <legend class="font-semibold">Titre (bande noire en haut)</legend>
            <label class="flex items-center gap-2 text-sm"><input v-model="detail.style.title.enabled" type="checkbox"> Afficher le titre</label>
            <input v-model="detail.style.title.fontName" aria-label="Police du titre" placeholder="Police (ex : Lato)" :class="fieldClass">
            <input v-model.number="detail.style.title.fontSize" type="number" min="30" max="120" aria-label="Taille du titre" :class="fieldClass">
            <label class="text-sm text-clippeak-muted">Lignes maximum <input v-model.number="detail.style.title.maxLines" type="number" min="1" max="3" :class="fieldClass"></label>
          </fieldset>
          <fieldset class="space-y-3">
            <legend class="font-semibold">Sous-titres mot par mot</legend>
            <label class="flex items-center gap-2 text-sm"><input v-model="detail.style.subtitles.enabled" type="checkbox"> Afficher les sous-titres</label>
            <label class="flex items-center gap-2 text-sm"><input v-model="detail.style.subtitles.uppercase" type="checkbox"> Majuscules</label>
            <input v-model="detail.style.subtitles.fontName" aria-label="Police des sous-titres" :class="fieldClass">
            <input v-model.number="detail.style.subtitles.fontSize" type="number" min="40" max="160" aria-label="Taille des sous-titres" :class="fieldClass">
          </fieldset>
          <fieldset class="space-y-3">
            <legend class="font-semibold">Zoom et son d'ouverture</legend>
            <label class="flex items-center gap-2 text-sm"><input v-model="detail.style.zoomIntro.enabled" type="checkbox"> Zoom au debut</label>
            <label class="text-sm text-clippeak-muted">Amplitude (0 a 0,4) <input v-model.number="detail.style.zoomIntro.amount" type="number" step="0.01" min="0" max="0.4" :class="fieldClass"></label>
            <label class="flex items-center gap-2 text-sm"><input v-model="detail.style.sfx.enabled" type="checkbox"> Bruit de vent / SFX</label>
            <label class="text-sm text-clippeak-muted">Fichier SFX
              <select v-model="detail.style.sfx.assetId" :class="fieldClass">
                <option :value="null">Bruit de vent par defaut</option>
                <option v-for="a in assetsOf('sfx')" :key="a.id" :value="a.id">{{ a.filename }}</option>
              </select>
            </label>
          </fieldset>
          <fieldset class="space-y-3">
            <legend class="font-semibold">Cadrage du streamer</legend>
            <label class="flex items-center gap-2 text-sm"><input v-model="detail.style.framing.auto" type="checkbox"> Cadrage automatique (reconnaissance du visage avec vos photos)</label>
            <p class="text-xs text-clippeak-muted">3 a 5 photos nettes suffisent (onglet Fichiers). Si vous n'etes pas reconnu dans le clip, le cadrage manuel ci-dessous est utilise et un avertissement s'affiche.</p>
            <label class="text-sm text-clippeak-muted">Position horizontale (0 gauche, 1 droite) <input v-model.number="detail.style.framing.centerX" type="number" step="0.05" min="0" max="1" :class="fieldClass"></label>
            <label class="text-sm text-clippeak-muted">Position verticale <input v-model.number="detail.style.framing.centerY" type="number" step="0.05" min="0" max="1" :class="fieldClass"></label>
            <label class="text-sm text-clippeak-muted">Zoom (1 = plan large, 2 = grand plan) <input v-model.number="detail.style.framing.zoom" type="number" step="0.1" min="1" max="3" :class="fieldClass"></label>
          </fieldset>
          <fieldset class="space-y-3">
            <legend class="font-semibold">Avatar / GIF</legend>
            <label class="flex items-center gap-2 text-sm"><input v-model="detail.style.overlay.enabled" type="checkbox"> Afficher l'avatar</label>
            <select v-model="detail.style.overlay.assetId" aria-label="Fichier avatar" :class="fieldClass">
              <option :value="null">Aucun fichier</option>
              <option v-for="a in assetsOf('avatar')" :key="a.id" :value="a.id">{{ a.filename }}</option>
            </select>
            <select v-model="detail.style.overlay.appear" aria-label="Apparition" :class="fieldClass">
              <option value="always">Tout le clip</option>
              <option value="intro">3 premieres secondes</option>
              <option value="outro">3 dernieres secondes</option>
            </select>
            <div class="grid grid-cols-3 gap-2">
              <input v-model.number="detail.style.overlay.x" type="number" aria-label="Position x" :class="fieldClass">
              <input v-model.number="detail.style.overlay.y" type="number" aria-label="Position y" :class="fieldClass">
              <input v-model.number="detail.style.overlay.width" type="number" aria-label="Largeur" :class="fieldClass">
            </div>
          </fieldset>
          <fieldset class="space-y-3 sm:col-span-2">
            <legend class="font-semibold">Illustrations et noms propres</legend>
            <label class="flex items-center gap-2 text-sm"><input v-model="detail.style.illustrations.enabled" type="checkbox"> Illustrations en ecran scinde (depuis vos videos deposees)</label>
            <label class="text-sm text-clippeak-muted">Noms a ecrire exactement (separes par des virgules)
              <input v-model="namesText" placeholder="Yassencore, Thanos" :class="fieldClass">
            </label>
          </fieldset>
        </div>
        <button type="button" :class="buttonClass" :disabled="busy" @click="saveStyle">Enregistrer la direction artistique</button>
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
