export interface TwitchCredentials {
  clientId: string
  clientSecret: string
  // Adresses de remplacement (tests d'integration avec un faux Twitch) ; par defaut les vraies.
  idBase?: string
  apiBase?: string
}

export interface TwitchUser {
  id: string
  login: string
  displayName: string
}

export interface TwitchVideo {
  id: string
  streamId: string | null
  url: string
  title: string
  createdAt: Date
  durationSec: number
}

// Une VOD vue par son identifiant : a qui elle appartient, de quel type, si tout le monde peut la voir.
export interface TwitchVideoDetails extends TwitchVideo {
  userLogin: string
  userName: string
  type: string
  viewable: string
}

export interface TwitchClip {
  id: string
  url: string
  title: string
  viewCount: number
  durationSec: number
  gameId: string | null
  createdAt: Date
  creatorName: string
}

export interface TwitchLiveStream {
  id: string
  userId: string
  startedAt: Date
}

// Helix renvoie la duree sous la forme "1h2m3s", "4m24s" ou "30s".
export function parseTwitchDuration(value: string | undefined): number {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value ?? '')
  if (!match) return 0
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
}

export class TwitchApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'TwitchApiError'
    this.status = status
  }
}

const DEFAULT_ID_BASE = 'https://id.twitch.tv'
const DEFAULT_API_BASE = 'https://api.twitch.tv'

export function createTwitchApi(
  creds: TwitchCredentials,
  fetchFn: typeof fetch = fetch,
  now: () => number = () => Date.now()
) {
  let token: { value: string, expiresAt: number } | null = null
  const TOKEN_URL = `${(creds.idBase ?? DEFAULT_ID_BASE).replace(/\/+$/, '')}/oauth2/token`
  const HELIX = `${(creds.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '')}/helix`

  async function getToken(force = false): Promise<string> {
    if (!force && token && token.expiresAt - 60_000 > now()) return token.value

    const response = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: 'client_credentials'
      }).toString()
    })
    if (!response.ok) {
      throw new TwitchApiError(`Obtention du jeton Twitch refusee (HTTP ${response.status})`, response.status)
    }
    const body = await response.json() as { access_token?: string, expires_in?: number }
    if (!body.access_token) throw new TwitchApiError('Reponse de jeton Twitch invalide', 502)
    token = { value: body.access_token, expiresAt: now() + (body.expires_in ?? 3600) * 1000 }
    return token.value
  }

  async function helix(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
    const response = await fetchFn(`${HELIX}${path}`, {
      ...init,
      headers: {
        'Authorization': `Bearer ${await getToken(retried)}`,
        'Client-Id': creds.clientId,
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined)
      }
    })
    if (response.status === 401 && !retried) return helix(path, init, true)
    return response
  }

  async function getUserByLogin(login: string): Promise<TwitchUser | null> {
    const response = await helix(`/users?login=${encodeURIComponent(login)}`)
    if (!response.ok) throw new TwitchApiError(`Recherche du streamer impossible (HTTP ${response.status})`, response.status)
    const body = await response.json() as { data?: Array<{ id: string, login: string, display_name: string }> }
    const user = body.data?.[0]
    return user ? { id: user.id, login: user.login, displayName: user.display_name } : null
  }

  async function listArchives(userId: string, first = 20): Promise<TwitchVideo[]> {
    const response = await helix(`/videos?user_id=${encodeURIComponent(userId)}&type=archive&first=${first}`)
    if (!response.ok) throw new TwitchApiError(`Liste des VODs impossible (HTTP ${response.status})`, response.status)
    const body = await response.json() as {
      data?: Array<{ id: string, stream_id: string | null, url: string, title: string, created_at: string, duration?: string }>
    }
    return (body.data ?? []).map(v => ({
      id: v.id,
      streamId: v.stream_id ?? null,
      url: v.url,
      title: v.title,
      createdAt: new Date(v.created_at),
      durationSec: parseTwitchDuration(v.duration)
    }))
  }

  // Une VOD par son identifiant (null si elle n'existe pas ou n'est plus visible).
  async function getVideoById(id: string): Promise<TwitchVideoDetails | null> {
    const response = await helix(`/videos?id=${encodeURIComponent(id)}`)
    if (response.status === 404) return null
    if (!response.ok) throw new TwitchApiError(`Lecture de la VOD impossible (HTTP ${response.status})`, response.status)
    const body = await response.json() as {
      data?: Array<{ id: string, stream_id: string | null, user_login: string, user_name: string, url: string, title: string, created_at: string, duration?: string, type?: string, viewable?: string }>
    }
    const v = body.data?.[0]
    if (!v) return null
    return {
      id: v.id, streamId: v.stream_id ?? null, url: v.url, title: v.title, createdAt: new Date(v.created_at), durationSec: parseTwitchDuration(v.duration),
      userLogin: v.user_login, userName: v.user_name, type: v.type ?? 'unknown', viewable: v.viewable ?? 'public'
    }
  }

  // Chaines actuellement en direct, par lots de 100 (limite de Helix). Absente de la Map = hors ligne.
  async function getLiveStreams(userIds: string[]): Promise<Map<string, TwitchLiveStream>> {
    const live = new Map<string, TwitchLiveStream>()
    for (let i = 0; i < userIds.length; i += 100) {
      const query = userIds.slice(i, i + 100).map(id => `user_id=${encodeURIComponent(id)}`).join('&')
      const response = await helix(`/streams?${query}&first=100`)
      if (!response.ok) throw new TwitchApiError(`Liste des directs impossible (HTTP ${response.status})`, response.status)
      const body = await response.json() as {
        data?: Array<{ id: string, user_id: string, started_at: string, type?: string }>
      }
      for (const s of body.data ?? []) {
        if (s.type && s.type !== 'live') continue
        live.set(s.user_id, { id: s.id, userId: s.user_id, startedAt: new Date(s.started_at) })
      }
    }
    return live
  }

  async function subscribe(type: 'stream.online' | 'stream.offline', userId: string, callback: string, secret: string): Promise<'created' | 'exists'> {
    const response = await helix('/eventsub/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        type,
        version: '1',
        condition: { broadcaster_user_id: userId },
        transport: { method: 'webhook', callback, secret }
      })
    })
    if (response.status === 409) return 'exists'
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new TwitchApiError(`Abonnement ${type} refuse (HTTP ${response.status}) ${detail}`.trim(), response.status)
    }
    return 'created'
  }

  // Clips les plus vus d'une chaine (Helix les renvoie tries par nombre de vues decroissant).
  async function listClips(broadcasterId: string, first = 100): Promise<TwitchClip[]> {
    const response = await helix(`/clips?broadcaster_id=${encodeURIComponent(broadcasterId)}&first=${Math.min(100, first)}`)
    if (!response.ok) throw new TwitchApiError(`Liste des clips impossible (HTTP ${response.status})`, response.status)
    const body = await response.json() as {
      data?: Array<{ id: string, url: string, title: string, view_count: number, duration: number, game_id: string, created_at: string, creator_name: string }>
    }
    return (body.data ?? []).map(c => ({
      id: c.id,
      url: c.url,
      title: c.title,
      viewCount: c.view_count,
      durationSec: c.duration,
      gameId: c.game_id || null,
      createdAt: new Date(c.created_at),
      creatorName: c.creator_name
    }))
  }

  async function getGameNames(gameIds: string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>()
    const unique = [...new Set(gameIds.filter(Boolean))]
    for (let i = 0; i < unique.length; i += 100) {
      const query = unique.slice(i, i + 100).map(id => `id=${encodeURIComponent(id)}`).join('&')
      const response = await helix(`/games?${query}`)
      if (!response.ok) throw new TwitchApiError(`Liste des categories impossible (HTTP ${response.status})`, response.status)
      const body = await response.json() as { data?: Array<{ id: string, name: string }> }
      for (const game of body.data ?? []) names.set(game.id, game.name)
    }
    return names
  }

  return { getToken, getUserByLogin, listArchives, getVideoById, getLiveStreams, listClips, getGameNames, subscribe }
}

export type TwitchApi = ReturnType<typeof createTwitchApi>
