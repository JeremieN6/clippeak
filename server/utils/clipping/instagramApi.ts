// Client Instagram minimal (« Instagram API with Unified Login », Facebook Login for Business), sans dependance : connexion, compte, Reels.
// Les messages d'erreur ne contiennent jamais de jeton ni de secret. `fetchFn` est injectable pour les essais.
// Adresses et noms de parametres : pages officielles de Meta lues les 2026-11-15 et 2026-11-16 (voir PROCEDURE-INSTAGRAM.md).
import { createHmac, timingSafeEqual } from 'node:crypto'

type FetchFn = typeof fetch

export const INSTAGRAM_OAUTH_BASE = 'https://www.facebook.com'
export const INSTAGRAM_GRAPH_BASE = 'https://graph.facebook.com'
export const INSTAGRAM_GRAPH_VERSION = 'v27.0'
// Avec la connexion unifiee, les droits (instagram_basic, instagram_content_publish) sont fixes dans la « configuration » creee dans le tableau
// de bord Meta, pas dans le lien de connexion.
export function buildInstagramAuthUrl(params: { appId: string, configId: string, redirectUri: string, state: string, oauthBase?: string }): string {
  const url = new URL(`${params.oauthBase ?? INSTAGRAM_OAUTH_BASE}/dialog/oauth`)
  url.searchParams.set('client_id', params.appId)
  url.searchParams.set('config_id', params.configId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', params.state)
  // Les deux parametres ci-dessous sont dans l'URL de connexion que Meta donne dans le tableau de bord (verifie le 2026-11-16) :
  // `override_default_response_type` pour recevoir un code (et non un jeton) ; `prompt=login` affiche le choix Instagram OU Facebook,
  // un streamer sans compte Facebook peut ainsi se connecter avec son compte Instagram (non confirme : pas essaye sans compte Facebook).
  url.searchParams.set('override_default_response_type', 'true')
  url.searchParams.set('prompt', 'login')
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
  // Absent : Meta n'a donne aucune echeance (jeton d'utilisateur systeme configure « jamais »).
  expiresAt: Date | null
}

interface ExchangeParams { appId: string, appSecret: string, code: string, redirectUri: string, graphBase?: string, now?: () => number }

// Echange le code d'autorisation contre le jeton de l'entreprise du streamer (jeton d'utilisateur systeme). Pas de renouvellement : il dure
// selon la configuration (« jamais » chez nous) et cesse de marcher si le streamer retire l'application, il doit alors reconnecter.
export async function exchangeInstagramCode(fetchFn: FetchFn, params: ExchangeParams): Promise<InstagramTokens> {
  const now = params.now ?? Date.now
  const url = new URL(`${params.graphBase ?? INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_GRAPH_VERSION}/oauth/access_token`)
  url.searchParams.set('client_id', params.appId)
  url.searchParams.set('client_secret', params.appSecret)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('code', params.code)
  const body = await call<{ access_token?: string, expires_in?: number }>(fetchFn, url.toString(), undefined, 'Connexion Instagram')
  if (!body.access_token) throw new InstagramApiError('rejected', '', 'Connexion Instagram : Meta n’a pas renvoyé de jeton')
  const expiresIn = Number(body.expires_in)
  return { accessToken: body.access_token, expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(now() + expiresIn * 1000) : null }
}

// L'acces a expire seulement si Meta a donne une echeance et qu'elle est passee.
export const instagramTokenExpired = (expiresAt: Date | null, nowMs: number): boolean => expiresAt !== null && expiresAt.getTime() <= nowMs

export interface InstagramProfile { userId: string, username: string }

// Comptes Instagram professionnels que l'entreprise du streamer a assignes a Clippeak. Attention : Meta garde les comptes deja partages lors
// d'une connexion precedente, meme si le streamer ne les coche plus : c'est donc le streamer qui choisit le bon dans Clippeak.
export async function fetchInstagramAccounts(fetchFn: FetchFn, accessToken: string, graphBase = INSTAGRAM_GRAPH_BASE): Promise<InstagramProfile[]> {
  const url = new URL(`${graphBase}/${INSTAGRAM_GRAPH_VERSION}/me/assigned_instagram_accounts`)
  url.searchParams.set('fields', 'id,username')
  const body = await call<{ data?: Array<Record<string, string>> }>(fetchFn, url.toString(), { headers: { authorization: `Bearer ${accessToken}` } }, 'Lecture du compte Instagram')
  return (body.data ?? []).filter(item => item.id).slice(0, 50).map(item => ({ userId: String(item.id), username: String(item.username ?? '').slice(0, 120) }))
}

// Premier compte de la liste : celui qu'on garde a la connexion, le streamer peut en choisir un autre ensuite.
export async function fetchInstagramProfile(fetchFn: FetchFn, accessToken: string, graphBase = INSTAGRAM_GRAPH_BASE): Promise<InstagramProfile | null> {
  return (await fetchInstagramAccounts(fetchFn, accessToken, graphBase))[0] ?? null
}

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
