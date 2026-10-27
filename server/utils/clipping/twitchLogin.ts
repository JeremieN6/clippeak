// Connexion « Se connecter avec Twitch » (OAuth, flux a code d'autorisation). Aucune permission (scope) n'est demandee :
// on veut seulement savoir QUI se connecte. Le jeton Twitch n'est pas conserve, il sert une fois a lire l'identite.
import { randomBytes, createHash } from 'node:crypto'

export const SESSION_COOKIE = 'clippeak_session'
export const STATE_COOKIE = 'clippeak_oauth_state'
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000

export class TwitchLoginError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TwitchLoginError'
  }
}

export interface TwitchIdentity {
  id: string
  login: string
  displayName: string
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>

export function buildAuthorizeUrl(params: { clientId: string, redirectUri: string, state: string }): string {
  const url = new URL('https://id.twitch.tv/oauth2/authorize')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', params.state)
  // Pas de scope : identite seulement.
  return url.toString()
}

export async function exchangeCode(fetchFn: FetchLike, params: { clientId: string, clientSecret: string, code: string, redirectUri: string, idBase?: string }): Promise<string> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    grant_type: 'authorization_code',
    redirect_uri: params.redirectUri
  })
  const response = await fetchFn(`${params.idBase ?? 'https://id.twitch.tv'}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  if (!response.ok) throw new TwitchLoginError(`Echange du code refuse par Twitch (HTTP ${response.status})`)
  const json = await response.json() as { access_token?: unknown }
  if (typeof json.access_token !== 'string' || !json.access_token) throw new TwitchLoginError('Reponse Twitch inattendue (pas de jeton)')
  return json.access_token
}

export async function fetchIdentity(fetchFn: FetchLike, params: { clientId: string, accessToken: string, apiBase?: string }): Promise<TwitchIdentity> {
  const response = await fetchFn(`${params.apiBase ?? 'https://api.twitch.tv'}/helix/users`, {
    headers: { authorization: `Bearer ${params.accessToken}`, 'client-id': params.clientId }
  })
  if (!response.ok) throw new TwitchLoginError(`Lecture du profil Twitch impossible (HTTP ${response.status})`)
  const json = await response.json() as { data?: Array<{ id?: unknown, login?: unknown, display_name?: unknown }> }
  const user = json.data?.[0]
  if (!user || typeof user.id !== 'string' || typeof user.login !== 'string') throw new TwitchLoginError('Reponse Twitch inattendue (pas de profil)')
  return { id: user.id, login: user.login.toLowerCase(), displayName: typeof user.display_name === 'string' && user.display_name ? user.display_name : user.login }
}

// Pseudo Twitch : 3 a 25 caracteres, lettres minuscules, chiffres, underscore. null si invalide.
export function normalizeLogin(value: unknown): string | null {
  const login = typeof value === 'string' ? value.trim().replace(/^@/, '').toLowerCase() : ''
  return /^[a-z0-9_]{3,25}$/.test(login) ? login : null
}

// Jeton de session aleatoire (256 bits) ; seul son hash est enregistre en base.
export const newToken = () => randomBytes(32).toString('base64url')
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
