// Etat et actions du back-office du streamer, partages entre le parcours guide (8 etapes) et le tableau de bord.
// Le mot de passe reste en memoire (jamais dans l'URL ni dans le stockage du navigateur) et part dans l'en-tete x-admin-password.

export interface StudioChannel { id: string, login: string, displayName: string, autoClip: boolean }

export interface StudioClip {
  id: string, batch: number | null, status: string, title: string | null, caption: string | null, hashtags: string | null
  error: string | null, qc: { passed: boolean, issues: Array<{ severity: string, message: string }> } | null
  illustrations: Array<{ path: string, source: string }> | null, reviewNote: string | null, score: number | null
  kind: string | null, category: string | null, hook: string | null, rationale: string | null, scorer: string | null
  channel: string, videoUrl: string | null, origin: 'chat' | 'ref', createdAt: string, durationSec: number | null
}

export const STEPS = [
  { n: 1, label: 'Tes clips de référence', tag: 'Obligatoire', required: true },
  { n: 2, label: 'Tes photos', tag: 'Conseillé', required: false },
  { n: 3, label: 'Le look de tes clips', tag: 'Facultatif', required: false },
  { n: 4, label: 'Les sons', tag: 'Facultatif', required: false },
  { n: 5, label: 'Tes illustrations', tag: 'Facultatif', required: false },
  { n: 6, label: 'La détection', tag: 'Facultatif', required: false },
  { n: 7, label: 'Tes plateformes', tag: 'Facultatif', required: false },
  { n: 8, label: 'Récapitulatif', tag: '', required: true }
] as const

export const PLATFORM_LIST = [
  { id: 'tiktok', name: 'TikTok', mono: 'TT', sub: 'Vidéos verticales' },
  { id: 'instagram', name: 'Instagram Reels', mono: 'IG', sub: 'Compte professionnel requis' },
  { id: 'youtube', name: 'YouTube Shorts', mono: 'YT', sub: 'Chaîne YouTube' }
] as const

export type StepStatus = 'ok' | 'warn' | 'skip' | 'todo'

export function createStudio() {
  const password = ref('')
  const connected = ref(false)
  const error = ref('')
  const notice = ref('')
  const busy = ref(false)

  const channels = ref<StudioChannel[]>([])
  const channelId = ref('')
  const detail = ref<any>(null)
  const bank = ref<any>(null)
  const clips = ref<StudioClip[]>([])

  // 'onboarding' tant que le parcours n'est pas termine, puis 'dashboard' ; le streamer peut revenir a une etape depuis le tableau de bord.
  const view = ref<'onboarding' | 'dashboard'>('onboarding')
  const step = ref(1)

  const headers = computed(() => ({ 'x-admin-password': password.value.trim() }))

  async function api<T>(url: string, options: Record<string, any> = {}): Promise<T> {
    try {
      return await $fetch<T>(url, { ...options, headers: { ...headers.value, ...(options.headers ?? {}) } })
    } catch (e: any) {
      throw new Error(e?.data?.statusMessage || e?.statusMessage || 'Requête refusée')
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

  const onboarding = computed(() => detail.value?.style.onboarding as { done: number[], skipped: number[], completed: boolean, platforms: string[] } | undefined)
  const assetsOf = (kind: string) => (detail.value?.assets ?? []).filter((a: any) => a.kind === kind)

  async function loadBank() {
    if (!channelId.value) return
    bank.value = await api(`/api/studio/channels/${channelId.value}/references`)
  }

  async function loadChannel() {
    if (!channelId.value) return
    detail.value = await api(`/api/studio/channels/${channelId.value}`)
    // L'interrupteur des sous-titres est dans la direction artistique : un ancien "desactive" des reglages est repris.
    if (detail.value.settings && detail.value.settings.subtitles === false) detail.value.style.subtitles.enabled = false
    await loadBank()
  }

  async function loadClips() {
    const data = await api<{ clips: StudioClip[] }>('/api/studio/clips', { query: { status: 'all' } })
    clips.value = data.clips
  }

  // Premiere etape non faite (ou la derniere) a l'ouverture du parcours.
  function firstOpenStep(): number {
    const handled = new Set([...(onboarding.value?.done ?? []), ...(onboarding.value?.skipped ?? [])])
    return STEPS.find(s => s.n < 8 && !handled.has(s.n))?.n ?? 8
  }

  const connect = () => run(async () => {
    const data = await api<{ channels: StudioChannel[] }>('/api/studio/channels')
    channels.value = data.channels
    connected.value = true
    channelId.value = data.channels[0]?.id ?? ''
    await Promise.all([loadChannel(), loadClips()])
    view.value = onboarding.value?.completed ? 'dashboard' : 'onboarding'
    step.value = firstOpenStep()
  })

  const switchChannel = () => run(async () => {
    await Promise.all([loadChannel(), loadClips()])
    view.value = onboarding.value?.completed ? 'dashboard' : 'onboarding'
    step.value = firstOpenStep()
  })

  // --- Enregistrements ---------------------------------------------------------------------------------------------

  async function putSettings() {
    const r = detail.value.settings
    await api(`/api/studio/channels/${channelId.value}/settings`, {
      method: 'PUT',
      body: { keywords: r.keywords, clipMinSec: r.clipMinSec, clipMaxSec: r.clipMaxSec, subtitles: detail.value.style.subtitles.enabled, accentColor: r.accentColor, highlightColor: r.highlightColor }
    })
  }

  async function putStyle() {
    await api(`/api/studio/channels/${channelId.value}/style`, { method: 'PUT', body: detail.value.style })
  }

  // Direction artistique (etapes 3 a 5) : style complet + couleurs / interrupteur des sous-titres, qui vivent dans les reglages.
  const saveLook = () => run(async () => {
    await putStyle()
    if (detail.value.settings) await putSettings()
    await loadChannel()
  }, 'Enregistré.')

  const saveDetection = () => run(async () => {
    await putSettings()
    await loadChannel()
  }, 'Enregistré.')

  // Avancement du parcours : enregistre `done` / `skipped` dans le style, sans toucher au reste.
  async function recordStep(n: number, kind: 'done' | 'skipped') {
    const o = detail.value.style.onboarding
    const other = kind === 'done' ? 'skipped' : 'done'
    if (!o[kind].includes(n)) o[kind] = [...o[kind], n]
    o[other] = o[other].filter((x: number) => x !== n)
    await putStyle()
  }

  const setPlatforms = (platforms: string[]) => run(async () => {
    detail.value.style.onboarding.platforms = platforms
    await putStyle()
  })

  // Passe a l'etape suivante apres avoir enregistre ce qu'elle contient. Les etapes 3 a 5 partagent le meme style, 6 les reglages.
  const advance = (kind: 'done' | 'skipped') => run(async () => {
    const n = step.value
    if (kind === 'done') {
      if (n >= 3 && n <= 5) { await putStyle(); if (detail.value.settings) await putSettings() }
      if (n === 6) await putSettings()
    }
    await recordStep(n, kind)
    step.value = Math.min(8, n + 1)
  })

  const finishOnboarding = () => run(async () => {
    detail.value.style.onboarding.completed = true
    await putStyle()
    await Promise.all([loadChannel(), loadClips()])
    view.value = 'dashboard'
  })

  function goToStep(n: number) {
    step.value = n
    view.value = 'onboarding'
  }

  // Etat de chaque etape pour la barre laterale et le recapitulatif.
  function stepStatus(n: number): { status: StepStatus, text: string } {
    const o = onboarding.value
    const done = o?.done.includes(n) ?? false
    const skipped = o?.skipped.includes(n) ?? false
    const photos = assetsOf('photo').length
    const refs = bank.value?.profile
    const s = detail.value?.style
    const d = detail.value?.settings
    const base = (okText: string, skipText: string): { status: StepStatus, text: string } =>
      done ? { status: 'ok', text: okText } : skipped ? { status: 'skip', text: skipText } : { status: 'todo', text: 'Pas encore faite.' }
    switch (n) {
      case 1: {
        if (!bank.value?.items?.length) return { status: 'warn', text: 'Aucun clip de référence : Clippeak ne sait pas quoi chercher.' }
        return { status: 'ok', text: `${refs?.analyzedCount ?? 0} clip(s) analysé(s) sur ${bank.value.items.length}.` }
      }
      case 2:
        if (photos >= 3) return { status: 'ok', text: `${photos} photos : le cadrage automatique est possible.` }
        if (skipped && !photos) return { status: 'skip', text: 'Passée. Le cadrage manuel sera utilisé.' }
        return { status: 'warn', text: `${photos} photo(s) : il en faut 3 pour le cadrage automatique.` }
      case 3: return base(`Titre, sous-titres${s?.zoomIntro.enabled ? ' et zoom d’ouverture' : ''} réglés.`, 'Passée : le style par défaut est utilisé.')
      case 4: return base(s?.sfx.enabled ? 'Bruitages activés.' : 'Bruitages coupés.', 'Passée : les sons par défaut sont utilisés.')
      case 5: {
        const count = assetsOf('illustration').length
        return base(count ? `${count} illustration(s).` : 'Aucune illustration, ça fonctionne sans.', 'Passée. Tes clips fonctionnent sans.')
      }
      case 6: return base(`${d?.keywords.length ?? 0} mot(s) de chat, clips de ${d?.clipMinSec ?? '?'} à ${d?.clipMaxSec ?? '?'} secondes.`, 'Passée : les réglages par défaut sont utilisés.')
      case 7: {
        const chosen = o?.platforms ?? []
        if (chosen.length) return { status: 'warn', text: `${chosen.length} plateforme(s) choisie(s). La connexion n’est pas encore disponible : télécharge tes clips en attendant.` }
        return done || skipped ? { status: 'skip', text: 'Aucune publication automatique. Les clips sont à télécharger.' } : { status: 'todo', text: 'Pas encore faite.' }
      }
      default: return { status: 'todo', text: '' }
    }
  }

  // --- Fichiers ----------------------------------------------------------------------------------------------------

  async function uploadAssets(kind: string, files: File[], extra: { tags?: string, source?: string } = {}) {
    const failed: string[] = []
    let added = 0
    for (const file of files) {
      const form = new FormData()
      form.append('kind', kind)
      form.append('tags', extra.tags ?? '')
      form.append('source', extra.source ?? '')
      form.append('file', file)
      try {
        await api(`/api/studio/channels/${channelId.value}/assets`, { method: 'POST', body: form })
        added++
      } catch (e: any) {
        failed.push(`${file.name} : ${e.message}`)
      }
    }
    await loadChannel()
    if (added) notice.value = `${added} fichier(s) ajouté(s).`
    if (failed.length) error.value = failed.join(' · ')
  }

  const addAssets = (kind: string, files: File[]) => run(() => uploadAssets(kind, files))

  const saveAsset = (id: string, tags: string[], source: string) => run(async () => {
    await api(`/api/studio/assets/${id}`, { method: 'PATCH', body: { tags, source: source.trim() || null } })
    await loadChannel()
  }, 'Illustration enregistrée.')

  const removeAsset = (id: string) => run(async () => {
    await api(`/api/studio/assets/${id}`, { method: 'DELETE' })
    await loadChannel()
  }, 'Fichier supprimé.')

  // --- Banque de reference -----------------------------------------------------------------------------------------

  const addReferences = (files: File[], urls: string) => run(async () => {
    const form = new FormData()
    for (const file of files) form.append('files', file)
    form.append('urls', urls)
    const r = await api<any>(`/api/studio/channels/${channelId.value}/references`, { method: 'POST', body: form })
    await loadBank()
    const problems = [...r.rejectedLinks.map((u: string) => `lien refusé : ${u}`), ...r.refusedFiles]
    notice.value = `${r.addedFiles} fichier(s) et ${r.addedLinks} lien(s) ajouté(s)${r.duplicateLinks ? ` (${r.duplicateLinks} déjà présent(s))` : ''}. L’analyse démarre au prochain passage du worker.`
    if (problems.length) error.value = problems.join(' · ')
  })

  const saveStat = (id: string, field: string, raw: string) => run(async () => {
    const value = raw.trim() === '' ? null : Number(raw.replace(/\s/g, '').replace(',', '.'))
    if (value !== null && !Number.isFinite(value)) throw new Error('Nombre invalide')
    await api(`/api/studio/references/${id}`, { method: 'PATCH', body: { [field]: value } })
    await loadBank()
  })

  const removeReference = (id: string) => run(async () => {
    await api(`/api/studio/references/${id}`, { method: 'DELETE' })
    await loadBank()
  }, 'Élément supprimé.')

  // --- Clips -------------------------------------------------------------------------------------------------------

  const reviewClip = (clip: StudioClip, action: 'approve' | 'reject' | 'requeue', draft: { caption?: string, title?: string, note?: string } = {}) => run(async () => {
    const body = action === 'approve' ? { action, caption: draft.caption, note: draft.note || undefined }
      : action === 'reject' ? { action, note: draft.note || undefined }
        : { action, title: draft.title || undefined, replan: true, note: draft.note || undefined }
    await api(`/api/studio/clips/${clip.id}/review`, { method: 'POST', body })
    await loadClips()
  }, action === 'approve' ? 'Clip approuvé. Rien n’a été publié.' : action === 'reject' ? 'Clip refusé.' : 'Clip remis en file pour un nouveau rendu.')

  const approveMany = (list: StudioClip[]) => run(async () => {
    for (const clip of list) await api(`/api/studio/clips/${clip.id}/review`, { method: 'POST', body: { action: 'approve', caption: clip.caption ?? undefined } })
    await loadClips()
  }, `${list.length} clip(s) approuvé(s). Rien n’a été publié.`)

  return {
    password, connected, error, notice, busy, channels, channelId, detail, bank, clips, view, step, onboarding,
    api, run, assetsOf, connect, switchChannel, loadChannel, loadBank, loadClips,
    saveLook, saveDetection, setPlatforms, advance, finishOnboarding, goToStep, stepStatus,
    addAssets, saveAsset, removeAsset, addReferences, saveStat, removeReference, reviewClip, approveMany
  }
}

export type Studio = ReturnType<typeof createStudio>

export const STUDIO_KEY = 'studio'

// A appeler dans les composants du back-office (le store est cree et fourni par la page).
export function useStudio(): Studio {
  const studio = inject<Studio>(STUDIO_KEY)
  if (!studio) throw new Error('Studio non initialisé')
  return studio
}
