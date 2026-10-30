// Etat de la page /admin : connexion par mot de passe (verifie une fois, puis cookie de session), invitations et chaines.
// La page n'est liee depuis nulle part : on y arrive en tapant l'adresse.

export interface AdminInvite { id: string, login: string, note: string | null, connected: boolean, createdAt: string, lastLoginAt: string | null }
export interface AdminAccessRequest { id: string, login: string, displayName: string | null, createdAt: string }
export interface AdminVod { id: string, twitchVodId: string, url: string, title: string | null, status: string, error: string | null, createdAt: string, channel: string, channelId: string, moments: number, clips: number, durationSec: number, progress: { phase: 'blocked' | 'waiting' | 'analyzing' | 'rendering' | 'ready' | 'failed', estimateSec: number | null, clipsTotal: number, clipsInProgress: number } }
export interface AdminChannel { id: string, login: string, displayName: string, demo: boolean, test: boolean }

export function createAdmin() {
  const authed = ref(false)
  const checking = ref(true)
  const password = ref('')
  const error = ref('')
  const notice = ref('')
  const busy = ref(false)
  const invites = ref<AdminInvite[]>([])
  const accessRequests = ref<AdminAccessRequest[]>([])
  const channels = ref<AdminChannel[]>([])
  const vods = ref<AdminVod[]>([])

  async function run(task: () => Promise<void>, success = '') {
    busy.value = true
    error.value = ''
    notice.value = ''
    try {
      await task()
      if (success) notice.value = success
    } catch (e: any) {
      error.value = e?.data?.statusMessage || e?.statusMessage || 'Requête refusée'
    } finally {
      busy.value = false
    }
  }

  async function refresh() {
    await $fetch('/api/admin/demo', { method: 'POST' })
    const [inv, chan, req] = await Promise.all([
      $fetch<{ invites: AdminInvite[] }>('/api/admin/invites'),
      $fetch<{ channels: AdminChannel[] }>('/api/studio/channels'),
      $fetch<{ requests: AdminAccessRequest[] }>('/api/admin/access-requests')
    ])
    invites.value = inv.invites
    accessRequests.value = req.requests
    channels.value = chan.channels
  }

  async function restore() {
    try {
      await $fetch('/api/admin/me')
      authed.value = true
      await refresh()
    } catch {
      authed.value = false
    } finally {
      checking.value = false
    }
  }

  const login = () => run(async () => {
    await $fetch('/api/admin/login', { method: 'POST', body: { password: password.value } })
    password.value = ''
    authed.value = true
    await refresh()
  })

  const logout = () => run(async () => {
    await $fetch('/api/admin/logout', { method: 'POST' })
    authed.value = false
    invites.value = []
    accessRequests.value = []
    channels.value = []
    vods.value = []
  })

  const addInvite = (loginName: string, note: string) => run(async () => {
    await $fetch('/api/admin/invites', { method: 'POST', body: { login: loginName, note: note || undefined } })
    await refresh()
  }, 'Invitation ajoutée.')

  const inviteRequest = (id: string) => run(async () => {
    await $fetch(`/api/admin/access-requests/${id}/invite`, { method: 'POST' })
    await refresh()
  }, 'Invitation envoyée : il suffit à la personne de se reconnecter avec Twitch.')

  const dismissRequest = (id: string) => run(async () => {
    await $fetch(`/api/admin/access-requests/${id}`, { method: 'DELETE' })
    await refresh()
  }, 'Demande écartée.')

  const removeInvite = (id: string) => run(async () => {
    await $fetch(`/api/admin/invites/${id}`, { method: 'DELETE' })
    await refresh()
  }, 'Invitation retirée. Les sessions de cette chaîne sont fermées.')

  // « Prochainement » : fonctions, blocs de vote (totaux visibles pour l'admin) et idees des streamers.
  const roadmap = ref<{ features: Array<{ id: string, title: string, description: string, status: string, carriedVotes: number }>, blocks: Array<{ id: string, status: string, endsAt: string, decidedBy: string | null, winnerId: string | null, votes: number, a: { id: string, title: string, total: number }, b: { id: string, title: string, total: number } }>, ideas: Array<{ id: string, text: string, status: string, createdAt: string, channel: string }> } | null>(null)
  const loadRoadmap = () => run(async () => { roadmap.value = await $fetch('/api/admin/roadmap') })
  const roadmapAction = (method: 'POST' | 'PATCH', url: string, body: Record<string, unknown>, success: string) => run(async () => {
    await $fetch(url, { method, body })
    roadmap.value = await $fetch('/api/admin/roadmap')
  }, success)

  const loadVods = () => run(async () => {
    vods.value = (await $fetch<{ vods: AdminVod[] }>('/api/admin/vods')).vods
  })

  const addVod = (channelId: string, url: string, simulateRestricted = false) => run(async () => {
    const r = await $fetch<{ title: string, owner: string, durationSec: number, channel: string, blocked: boolean }>('/api/admin/vods', { method: 'POST', body: { channelId, url, simulateRestricted: simulateRestricted || undefined } })
    vods.value = (await $fetch<{ vods: AdminVod[] }>('/api/admin/vods')).vods
    notice.value = r.blocked
      ? `VOD de ${r.owner} ajoutée à ${r.channel}, mais réservée aux abonnés : elle attend d’être rendue publique (le streamer voit « Action requise »).`
      : `VOD de ${r.owner} ajoutée à ${r.channel} (${Math.round(r.durationSec / 60)} min) : le worker l’analyse au prochain passage.`
  })

  const retryVod = (id: string) => run(async () => {
    await $fetch(`/api/admin/vods/${id}/retry`, { method: 'POST' })
    vods.value = (await $fetch<{ vods: AdminVod[] }>('/api/admin/vods')).vods
  }, 'Analyse relancée.')

  const moveVod = (id: string, channelId: string) => run(async () => {
    await $fetch(`/api/admin/vods/${id}/move`, { method: 'POST', body: { channelId } })
    vods.value = (await $fetch<{ vods: AdminVod[] }>('/api/admin/vods')).vods
  }, 'VOD déplacée, avec ses clips : ils se refont dans le studio de la nouvelle chaîne (« Refaire le rendu »).')

  const removeVod = (id: string) => run(async () => {
    await $fetch(`/api/admin/vods/${id}`, { method: 'DELETE' })
    vods.value = (await $fetch<{ vods: AdminVod[] }>('/api/admin/vods')).vods
  }, 'VOD retirée.')

  const addTestChannel = (name: string) => run(async () => {
    await $fetch('/api/admin/test-channels', { method: 'POST', body: { name } })
    await refresh()
  }, 'Chaîne de test créée.')

  const removeTestChannel = (id: string) => run(async () => {
    await $fetch(`/api/admin/test-channels/${id}`, { method: 'DELETE' })
    await refresh()
  }, 'Chaîne de test supprimée avec ses clips, ses extraits et ses photos.')

  const resetDemo = () => run(async () => {
    await $fetch('/api/admin/demo/reset', { method: 'POST' })
    await refresh()
  }, 'Chaîne de démonstration remise à zéro.')

  return { authed, checking, password, error, notice, busy, invites, accessRequests, inviteRequest, dismissRequest, channels, vods, loadVods, roadmap, loadRoadmap, roadmapAction, addVod, retryVod, moveVod, removeVod, restore, login, logout, addInvite, removeInvite, resetDemo, addTestChannel, removeTestChannel }
}

export type Admin = ReturnType<typeof createAdmin>
