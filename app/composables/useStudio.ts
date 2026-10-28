// Etat et actions du studio, partages entre le parcours guide (8 etapes) et le tableau de bord. Le streamer est identifie par son cookie
// de session Twitch, l'admin par le cookie de session pose sur /admin : aucun mot de passe ne circule ici.

export interface StudioChannel { id: string, login: string, displayName: string, autoClip: boolean, demo: boolean }

export interface StudioClip {
  id: string, batch: number | null, status: string, title: string | null, caption: string | null, hashtags: string | null
  error: string | null, qc: { passed: boolean, issues: Array<{ severity: string, message: string }> } | null
  illustrations: Array<{ path: string, source: string }> | null, reviewNote: string | null, score: number | null
  kind: string | null, category: string | null, hook: string | null, rationale: string | null, scorer: string | null
  channel: string, videoUrl: string | null, origin: 'chat' | 'ref', createdAt: string, durationSec: number | null
  publications: StudioPublication[]
}

export interface StudioPublication { id: string, platform: string, status: string, scheduledAt: string, publishedAt: string | null, url: string | null, error: string | null }
export interface StudioConnection { platform: string, available: boolean, connected: boolean, accountName: string | null }

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
  { id: 'tiktok', name: 'TikTok', sub: 'Vidéos verticales' },
  { id: 'instagram', name: 'Instagram Reels', sub: 'Compte professionnel requis' },
  { id: 'youtube', name: 'YouTube Shorts', sub: 'Chaîne YouTube' }
] as const

export type StepStatus = 'ok' | 'warn' | 'skip' | 'todo'

export function createStudio() {
  const connected = ref(false)
  const error = ref('')
  const notice = ref('')
  const busy = ref(false)

  const channels = ref<StudioChannel[]>([])
  const channelId = ref('')
  const detail = ref<any>(null)
  const bank = ref<any>(null)
  const clips = ref<StudioClip[]>([])
  const connections = ref<StudioConnection[]>([])

  // 'onboarding' tant que le parcours n'est pas termine, puis 'dashboard' ; le streamer peut revenir a une etape depuis le tableau de bord.
  const view = ref<'onboarding' | 'dashboard'>('onboarding')

  // 'streamer' = connecte avec Twitch (ne voit que sa chaine) ; 'admin' = session de /admin (voit la chaine de demonstration et les autres).
  const mode = ref<'streamer' | 'admin' | null>(null)
  const step = ref(1)

  async function api<T>(url: string, options: Record<string, any> = {}): Promise<T> {
    try {
      return await $fetch<T>(url, options)
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

  async function loadConnections() {
    if (!channelId.value) return
    connections.value = (await api<{ connections: StudioConnection[] }>(`/api/studio/channels/${channelId.value}/connections`)).connections
  }

  async function loadChannel() {
    if (!channelId.value) return
    detail.value = await api(`/api/studio/channels/${channelId.value}`)
    // L'interrupteur des sous-titres est dans la direction artistique : un ancien "desactive" des reglages est repris.
    if (detail.value.settings && detail.value.settings.subtitles === false) detail.value.style.subtitles.enabled = false
    await Promise.all([loadBank(), loadConnections()])
  }

  async function loadClips() {
    const data = await api<{ clips: StudioClip[] }>('/api/studio/clips', { query: { status: 'all', channel: channelId.value || undefined } })
    clips.value = data.clips
  }

  // Premiere etape non faite (ou la derniere) a l'ouverture du parcours.
  function firstOpenStep(): number {
    const handled = new Set([...(onboarding.value?.done ?? []), ...(onboarding.value?.skipped ?? [])])
    return STEPS.find(s => s.n < 8 && !handled.has(s.n))?.n ?? 8
  }

  // Ouverture du studio. Streamer : sa chaine. Admin : la chaine demandee, sinon la chaine de demonstration (creee au besoin).
  // Renvoie false si personne n'est connecte (la page renvoie alors vers /connexion).
  async function restoreSession(preferred = ''): Promise<boolean> {
    try {
      const me = await $fetch<{ role: 'admin' | 'streamer', channel: StudioChannel | null }>('/api/auth/me')
      if (me.role === 'streamer' && me.channel) {
        channels.value = [me.channel]
        channelId.value = me.channel.id
        mode.value = 'streamer'
      } else {
        await $fetch('/api/admin/demo', { method: 'POST' })
        channels.value = (await $fetch<{ channels: StudioChannel[] }>('/api/studio/channels')).channels
        channelId.value = (channels.value.find(c => c.id === preferred) ?? channels.value.find(c => c.demo) ?? channels.value[0])?.id ?? ''
        mode.value = 'admin'
      }
      connected.value = true
      await Promise.all([loadChannel(), loadClips()])
      view.value = onboarding.value?.completed ? 'dashboard' : 'onboarding'
      step.value = firstOpenStep()
      return true
    } catch {
      connected.value = false
      mode.value = null
      return false
    }
  }

  // Deconnexion du streamer (l'admin se deconnecte depuis /admin).
  const logout = () => run(async () => {
    await $fetch('/api/auth/logout', { method: 'POST' })
    connected.value = false
    mode.value = null
    detail.value = null
    bank.value = null
    clips.value = []
    channels.value = []
    channelId.value = ''
  })

  // Admin : remet la chaine de demonstration a zero pour refaire le parcours d'un nouveau streamer.
  const resetDemo = () => run(async () => {
    const { channel } = await api<{ channel: StudioChannel }>('/api/admin/demo/reset', { method: 'POST' })
    channels.value = (await api<{ channels: StudioChannel[] }>('/api/studio/channels')).channels
    channelId.value = channel.id
    await Promise.all([loadChannel(), loadClips()])
    view.value = 'onboarding'
    step.value = 1
  }, 'Chaîne de démonstration remise à zéro.')

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
        const linked = connections.value.filter(c => c.connected).length
        if (linked) return { status: 'ok', text: `${linked} compte(s) connecté(s) : tu peux publier tes clips approuvés depuis le tableau de bord.` }
        if (chosen.length) return { status: 'warn', text: `${chosen.length} plateforme(s) choisie(s), aucune connectée : télécharge tes clips en attendant.` }
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

  // --- Publication -------------------------------------------------------------------------------------------------

  const disconnectPlatform = (platform: string) => run(async () => {
    await api(`/api/studio/channels/${channelId.value}/connections/${platform}`, { method: 'DELETE' })
    await Promise.all([loadConnections(), loadClips()])
  }, 'Compte déconnecté. Les publications programmées sur cette plateforme sont annulées.')

  // `at` null : maintenant. Rien ne part sans cet appel : approuver ne publie pas.
  const publishClip = (clip: StudioClip, platform: string, at: Date | null) => run(async () => {
    await api(`/api/studio/clips/${clip.id}/publish`, { method: 'POST', body: { platform, at: at ? at.toISOString() : undefined } })
    await loadClips()
  }, at ? 'Publication programmée.' : 'Publication lancée : elle part dans quelques instants.')

  const cancelPublication = (id: string) => run(async () => {
    await api(`/api/studio/publications/${id}`, { method: 'DELETE' })
    await loadClips()
  }, 'Publication annulée.')

  return {
    connected, error, notice, busy, channels, channelId, detail, bank, clips, connections, view, step, onboarding, mode,
    disconnectPlatform, publishClip, cancelPublication, loadConnections,
    api, run, assetsOf, restoreSession, logout, resetDemo, switchChannel, loadChannel, loadBank, loadClips,
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
