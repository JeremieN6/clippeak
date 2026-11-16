// Client Instagram minimal (« Instagram API with Instagram Login »), sans dependance : connexion (jeton de longue duree), profil, Reels.
// Les messages d'erreur ne contiennent jamais de jeton ni de secret. `fetchFn` est injectable pour les essais.
// Adresses et noms de parametres : pages officielles de Meta lues le 2026-11-15 (voir PROCEDURE-INSTAGRAM.md).
import { createHmac, timingSafeEqual } from 'node:crypto'

type FetchFn = typeof fetch

export const INSTAGRAM_OAUTH_BASE = 'https://api.instagram.com'
export const INSTAGRAM_GRAPH_BASE = 'https://graph.instagram.com'
export const INSTAGRAM_GRAPH_VERSION = 'v27.0'
// Seulement ce dont Clippeak a besoin : le nom du compte (affiche avant la publication) et la publication.
export const INSTAGRAM_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'] as const
// Jeton de longue duree : 60 jours. Renouvelable des 24 h d'age, tant qu'il n'a pas expire.
export const INSTAGRAM_TOKEN_DAYS = 60
const DAY_MS = 86_400_000

export function buildInstagramAuthUrl(params: { appId: string, redirectUri: string, state: string }): string {
  const url = new URL('https://www.instagram.com/oauth/authorize')
  url.searchParams.set('client_id', params.appId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', INSTAGRAM_SCOPES.join(','))
  url.searchParams.set('state', params.state)
  return url.toString()
}

export type InstagramErrorKind = 'auth' | 'quota' | 'rejected' | 'transient'
export class InstagramApiError extends Error {
  kind: InstagramErrorKind
  code: string
  constructor(kind: InstagramErrorKind, code: string, message: string) { super(message); this.name = 'InstagramApiError'; this.kind = kind; this.code = code }
}

interface MetaErrorBody {
  error?: { message?: string, type?: string, code?: number, error_subcode?: number, is_transient?: boolean, error_user_msg?: string }
  error_type?: string
  code?: number
  error_message?: string
}

// Range une erreur de Meta dans l'une des quatre familles utiles : reconnecter, abandonner, reessayer, attendre demain.
export function classifyInstagramError(status: number, body: MetaErrorBody): InstagramApiError {
  const code = Number(body.error?.code ?? body.code ?? 0)
  const raw = (body.error?.error_user_msg || body.error?.message || body.error_message || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const detail = raw || `HTTP ${status}`
  const tag = String(code || status)
  // 190 : jeton invalide ou expire ; 10 et 200-299 : permission manquante ou retiree.
  if (status === 401 || code === 190 || code === 10 || (code >= 200 && code <= 299)) {
    return new InstagramApiError('auth', tag, `${detail}. Reconnecte ton compte Instagram.`)
  }
  // 4, 17, 32, 613 : limites de Meta (application ou compte).
  if ([4, 17, 32, 613].includes(code) || status === 429) return new InstagramApiError('quota', tag, 'Instagram limite le nombre de publications ou de requêtes pour le moment : réessaie plus tard.')
  if (body.error?.is_transient || code === 1 || code === 2 || status >= 500) return new InstagramApiError('transient', tag, detail)
  return new InstagramApiError('rejected', tag, detail)
}

async function call<T>(fetchFn: FetchFn, url: string, init: RequestInit | undefined, what: string): Promise<T> {
  let response: Response
  try {
    response = await fetchFn(url, init)
  } catch {
    throw new InstagramApiError('transient', '', `${what} : connexion à Instagram impossible`)
  }
  const body = await response.json().catch(() => ({})) as MetaErrorBody & T
  if (!response.ok || body.error || body.error_type) {
    const failure = classifyInstagramError(response.status, body)
    failure.message = `${what} : ${failure.message}`
    throw failure
  }
  return body
}

export interface InstagramTokens {
  accessToken: string
  expiresAt: Date
  userId: string
  permissions: string
}

interface ExchangeParams { appId: string, appSecret: string, code: string, redirectUri: string, oauthBase?: string, graphBase?: string, now?: () => number }

// Echange le code d'autorisation (valable une heure, une seule fois) contre un jeton court, puis le jeton court contre un jeton de 60 jours.
export async function exchangeInstagramCode(fetchFn: FetchFn, params: ExchangeParams): Promise<InstagramTokens> {
  const now = params.now ?? Date.now
  const form = new URLSearchParams({ client_id: params.appId, client_secret: params.appSecret, grant_type: 'authorization_code', redirect_uri: params.redirectUri, code: params.code })
  const short = await call<{ access_token?: string, user_id?: string | number, permissions?: string, data?: Array<{ access_token?: string, user_id?: string | number, permissions?: string }> }>(
    fetchFn, `${params.oauthBase ?? INSTAGRAM_OAUTH_BASE}/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form }, 'Connexion Instagram')
  const first = short.data?.[0] ?? short
  if (!first.access_token || first.user_id == null) throw new InstagramApiError('rejected', '', 'Connexion Instagram : Instagram n’a pas renvoyé de jeton')
  const permissions = Array.isArray(first.permissions) ? (first.permissions as string[]).join(',') : String(first.permissions ?? '')
  if (permissions && !permissions.split(/[,\s]+/).includes('instagram_business_content_publish')) throw new InstagramApiError('rejected', '', 'Connexion Instagram : le droit de publier n’a pas été accordé')

  const url = new URL(`${params.graphBase ?? INSTAGRAM_GRAPH_BASE}/access_token`)
  url.searchParams.set('grant_type', 'ig_exchange_token')
  url.searchParams.set('client_secret', params.appSecret)
  url.searchParams.set('access_token', first.access_token)
  const long = await call<{ access_token?: string, expires_in?: number }>(fetchFn, url.toString(), undefined, 'Connexion Instagram')
  if (!long.access_token) throw new InstagramApiError('rejected', '', 'Connexion Instagram : Instagram n’a pas renvoyé de jeton de longue durée')
  return { accessToken: long.access_token, expiresAt: new Date(now() + (long.expires_in ?? INSTAGRAM_TOKEN_DAYS * 86400) * 1000), userId: String(first.user_id), permissions }
}

// Renouvelle un jeton de longue duree (a partir de 24 h d'age, avant son expiration) : le nouveau remplace l'ancien pour 60 jours.
export async function refreshInstagramToken(fetchFn: FetchFn, params: { token: string, graphBase?: string, now?: () => number }): Promise<{ accessToken: string, expiresAt: Date }> {
  const url = new URL(`${params.graphBase ?? INSTAGRAM_GRAPH_BASE}/refresh_access_token`)
  url.searchParams.set('grant_type', 'ig_refresh_token')
  url.searchParams.set('access_token', params.token)
  const body = await call<{ access_token?: string, expires_in?: number }>(fetchFn, url.toString(), undefined, 'Renouvellement de l’accès Instagram')
  if (!body.access_token) throw new InstagramApiError('rejected', '', 'Renouvellement de l’accès Instagram : pas de jeton renvoyé')
  return { accessToken: body.access_token, expiresAt: new Date((params.now ?? Date.now)() + (body.expires_in ?? INSTAGRAM_TOKEN_DAYS * 86400) * 1000) }
}

// Le jeton doit etre renouvele quand il lui reste moins de `INSTAGRAM_REFRESH_BELOW_DAYS` jours (donc qu'il a plus de quelques jours).
export const INSTAGRAM_REFRESH_BELOW_DAYS = 50
export function instagramRefreshDue(expiresAt: Date | null, nowMs: number): 'expired' | 'due' | 'fresh' {
  if (!expiresAt || expiresAt.getTime() <= nowMs) return 'expired'
  return expiresAt.getTime() - nowMs < INSTAGRAM_REFRESH_BELOW_DAYS * DAY_MS ? 'due' : 'fresh'
}

export interface InstagramProfile { userId: string, username: string, accountType: string | null }

// Compte connecte : identifiant, nom d'utilisateur, type (professionnel ou non). Un compte personnel ne peut pas publier par l'API.
export async function fetchInstagramProfile(fetchFn: FetchFn, accessToken: string, graphBase = INSTAGRAM_GRAPH_BASE): Promise<InstagramProfile> {
  const url = new URL(`${graphBase}/${INSTAGRAM_GRAPH_VERSION}/me`)
  url.searchParams.set('fields', 'user_id,username,account_type')
  const body = await call<{ data?: Array<Record<string, string>> } & Record<string, string>>(fetchFn, url.toString(), { headers: { authorization: `Bearer ${accessToken}` } }, 'Lecture du compte Instagram')
  const row = body.data?.[0] ?? body
  const userId = String(row.user_id ?? row.id ?? '')
  if (!userId) throw new InstagramApiError('rejected', '', 'Lecture du compte Instagram : identifiant manquant')
  return { userId, username: String(row.username ?? '').slice(0, 120), accountType: row.account_type ? String(row.account_type).toUpperCase() : null }
}

// Un compte professionnel est « BUSINESS » ou « MEDIA_CREATOR ». Type absent : on laisse Instagram trancher a la publication.
export const isProfessionalAccount = (type: string | null): boolean => type === null || type === 'BUSINESS' || type === 'MEDIA_CREATOR'

const reelUrl = (graphBase: string, path: string) => `${graphBase}/${INSTAGRAM_GRAPH_VERSION}/${path}`
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

// Conteneur de Reel : Meta telecharge elle-meme la video depuis `videoUrl` (URL publique). Le traitement est asynchrone.
export async function createReelContainer(fetchFn: FetchFn, params: { accessToken: string, userId: string, videoUrl: string, caption: string, graphBase?: string }): Promise<string> {
  const form = new URLSearchParams({ media_type: 'REELS', video_url: params.videoUrl, share_to_feed: 'true' })
  if (params.caption) form.set('caption', params.caption)
  const body = await call<{ id?: string }>(fetchFn, reelUrl(params.graphBase ?? INSTAGRAM_GRAPH_BASE, `${encodeURIComponent(params.userId)}/media`), { method: 'POST', headers: { ...bearer(params.accessToken), 'content-type': 'application/x-www-form-urlencoded' }, body: form }, 'Envoi du clip à Instagram')
  if (!body.id) throw new InstagramApiError('transient', '', 'Envoi du clip à Instagram : pas de conteneur ouvert')
  return body.id
}

export type ContainerStatus = 'IN_PROGRESS' | 'FINISHED' | 'ERROR' | 'EXPIRED' | 'PUBLISHED'

export async function fetchContainerStatus(fetchFn: FetchFn, accessToken: string, containerId: string, graphBase = INSTAGRAM_GRAPH_BASE): Promise<{ status: ContainerStatus, detail: string }> {
  const url = new URL(reelUrl(graphBase, encodeURIComponent(containerId)))
  url.searchParams.set('fields', 'status_code,status')
  const body = await call<{ status_code?: string, status?: string }>(fetchFn, url.toString(), { headers: bearer(accessToken) }, 'Suivi de l’envoi Instagram')
  const known: ContainerStatus[] = ['IN_PROGRESS', 'FINISHED', 'ERROR', 'EXPIRED', 'PUBLISHED']
  const status = known.find(s => s === body.status_code) ?? 'IN_PROGRESS'
  return { status, detail: String(body.status ?? '').slice(0, 200) }
}

export async function publishContainer(fetchFn: FetchFn, params: { accessToken: string, userId: string, containerId: string, graphBase?: string }): Promise<string> {
  const body = await call<{ id?: string }>(fetchFn, reelUrl(params.graphBase ?? INSTAGRAM_GRAPH_BASE, `${encodeURIComponent(params.userId)}/media_publish`), { method: 'POST', headers: { ...bearer(params.accessToken), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ creation_id: params.containerId }) }, 'Publication sur Instagram')
  if (!body.id) throw new InstagramApiError('rejected', '', 'Publication sur Instagram : Instagram n’a pas confirmé la publication')
  return body.id
}

// Lien du Reel publie (au mieux : l'absence de lien ne change rien a la publication).
export async function fetchPermalink(fetchFn: FetchFn, accessToken: string, mediaId: string, graphBase = INSTAGRAM_GRAPH_BASE): Promise<string | null> {
  try {
    const url = new URL(reelUrl(graphBase, encodeURIComponent(mediaId)))
    url.searchParams.set('fields', 'permalink')
    const response = await fetchFn(url.toString(), { headers: bearer(accessToken) })
    if (!response.ok) return null
    const body = await response.json() as { permalink?: string }
    return typeof body.permalink === 'string' && /^https:\/\/(www\.)?instagram\.com\//.test(body.permalink) ? body.permalink.slice(0, 300) : null
  } catch {
    return null
  }
}

// Rappels de Meta (desautorisation, suppression des donnees) : `signed_request` = signature.charge, en base64 « url », signee HMAC-SHA256 avec le
// secret de l'application. Renvoie la charge si la signature est bonne, sinon null.
export function parseInstagramSignedRequest(signed: string, appSecret: string): { user_id?: string | number, algorithm?: string } | null {
  const [sig, payload] = signed.split('.')
  if (!sig || !payload || !appSecret) return null
  try {
    const expected = createHmac('sha256', appSecret).update(payload).digest()
    const given = Buffer.from(sig, 'base64url')
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { user_id?: string | number, algorithm?: string }
    return !data.algorithm || String(data.algorithm).toUpperCase() === 'HMAC-SHA256' ? data : null
  } catch {
    return null
  }
}
