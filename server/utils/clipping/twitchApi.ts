export interface TwitchCredentials {
  clientId: string
  clientSecret: string
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

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const HELIX = 'https://api.twitch.tv/helix'

export function createTwitchApi(
  creds: TwitchCredentials,
  fetchFn: typeof fetch = fetch,
  now: () => number = () => Date.now()
) {
  let token: { value: string, expiresAt: number } | null = null

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

  return { getToken, getUserByLogin, listArchives, getLiveStreams, subscribe }
}

export type TwitchApi = ReturnType<typeof createTwitchApi>
