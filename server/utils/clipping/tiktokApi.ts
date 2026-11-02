// Client TikTok minimal, sans dependance : connexion (Login Kit), informations du createur et validation des reglages de publication.
// Les messages d'erreur ne contiennent jamais de jeton ni de secret. `fetchFn` est injectable pour les essais.
import { TIKTOK_PRIVACY_LEVELS } from './publishing.ts'
import type { TiktokPostOptions, TiktokPrivacyLevel } from './publishing.ts'

type FetchFn = typeof fetch

export const TIKTOK_API = 'https://open.tiktokapis.com'
// Seulement ce dont Clippeak a besoin : le pseudo du compte (affiche avant la publication) et la publication directe.
export const TIKTOK_SCOPES = ['user.info.basic', 'video.publish'] as const

export function buildTiktokAuthUrl(params: { clientKey: string, redirectUri: string, state: string }): string {
  const url = new URL('https://www.tiktok.com/v2/auth/authorize/')
  url.searchParams.set('client_key', params.clientKey)
  url.searchParams.set('scope', TIKTOK_SCOPES.join(','))
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', params.state)
  return url.toString()
}

export interface TiktokTokens {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  scope: string
  openId: string
}

interface TokenBody { access_token?: string, refresh_token?: string, expires_in?: number, scope?: string, open_id?: string, error?: string, error_description?: string }

async function tokenCall(fetchFn: FetchFn, form: Record<string, string>, base: string, now: () => number, what: string): Promise<TiktokTokens> {
  let response: Response
  try {
    response = await fetchFn(`${base}/v2/oauth/token/`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) })
  } catch {
    throw new Error(`${what} : connexion à TikTok impossible`)
  }
  const body = await response.json().catch(() => ({})) as TokenBody
  if (!response.ok || body.error) throw new Error(`${what} : TikTok a refusé (${body.error ?? `HTTP ${response.status}`})`)
  if (!body.access_token || !body.refresh_token) throw new Error(`${what} : TikTok n’a pas renvoyé de jetons`)
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(now() + (body.expires_in ?? 86400) * 1000),
    scope: body.scope ?? '',
    openId: body.open_id ?? ''
  }
}

// Echange le code d'autorisation contre les jetons (jeton d'acces 24 h, jeton de renouvellement 365 jours).
export async function exchangeTiktokCode(fetchFn: FetchFn, params: { clientKey: string, clientSecret: string, code: string, redirectUri: string, apiBase?: string, now?: () => number }): Promise<TiktokTokens> {
  const tokens = await tokenCall(fetchFn, { client_key: params.clientKey, client_secret: params.clientSecret, code: params.code, grant_type: 'authorization_code', redirect_uri: params.redirectUri }, params.apiBase ?? TIKTOK_API, params.now ?? Date.now, 'Connexion TikTok')
  if (!tokens.scope.split(',').includes('video.publish')) throw new Error('Connexion TikTok : le droit de publier n’a pas été accordé')
  return tokens
}

// Renouvelle l'acces. TikTok peut renvoyer un NOUVEAU jeton de renouvellement : il remplace l'ancien.
export function refreshTiktokTokens(fetchFn: FetchFn, params: { clientKey: string, clientSecret: string, refreshToken: string, apiBase?: string, now?: () => number }): Promise<TiktokTokens> {
  return tokenCall(fetchFn, { client_key: params.clientKey, client_secret: params.clientSecret, grant_type: 'refresh_token', refresh_token: params.refreshToken }, params.apiBase ?? TIKTOK_API, params.now ?? Date.now, 'Renouvellement de l’accès TikTok')
}

// Retire l'autorisation chez TikTok (au mieux : un echec n'empeche pas la deconnexion chez nous).
export async function revokeTiktokToken(fetchFn: FetchFn, params: { clientKey: string, clientSecret: string, token: string, apiBase?: string }): Promise<void> {
  try {
    await fetchFn(`${params.apiBase ?? TIKTOK_API}/v2/oauth/revoke/`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: params.clientKey, client_secret: params.clientSecret, token: params.token }) })
  } catch { /* au mieux */ }
}

// Nom affiche du compte, montre au streamer avant la publication.
export async function fetchTiktokDisplayName(fetchFn: FetchFn, accessToken: string, apiBase = TIKTOK_API): Promise<string | null> {
  try {
    const response = await fetchFn(`${apiBase}/v2/user/info/?fields=open_id,display_name`, { headers: { authorization: `Bearer ${accessToken}` } })
    if (!response.ok) return null
    const body = await response.json() as { data?: { user?: { display_name?: string } } }
    return body.data?.user?.display_name?.slice(0, 120) ?? null
  } catch {
    return null
  }
}

export interface TiktokCreatorInfo {
  nickname: string
  username: string
  avatarUrl: string | null
  privacyOptions: TiktokPrivacyLevel[]
  commentDisabled: boolean
  duetDisabled: boolean
  stitchDisabled: boolean
  maxVideoDurationSec: number
}

export type TiktokErrorKind = 'auth' | 'quota' | 'rejected' | 'transient'
export class TiktokApiError extends Error {
  kind: TiktokErrorKind
  code: string
  constructor(kind: TiktokErrorKind, code: string, message: string) { super(message); this.name = 'TiktokApiError'; this.kind = kind; this.code = code }
}

// Range une reponse d'erreur de TikTok (corps `error.code`) dans l'une des quatre familles utiles : reconnecter, abandonner, reessayer.
export function classifyTiktokError(status: number, code: string, message: string): TiktokApiError {
  const detail = message || code || `HTTP ${status}`
  if (status === 401 || code === 'access_token_invalid' || code === 'scope_not_authorized' || code === 'scope_permission_missed') {
    return new TiktokApiError('auth', code, `${detail}. Reconnecte ton compte TikTok.`)
  }
  if (code === 'spam_risk_too_many_posts') return new TiktokApiError('quota', code, 'TikTok limite le nombre de publications par jour sur ce compte : réessaie demain.')
  if (code === 'reached_active_user_cap') return new TiktokApiError('quota', code, 'Clippeak a atteint sa limite quotidienne de publications TikTok : réessaie demain.')
  if (code === 'spam_risk_user_banned_from_posting') return new TiktokApiError('rejected', code, 'TikTok a bloqué les publications de ce compte.')
  if (code === 'unaudited_client_can_only_post_to_private_accounts') return new TiktokApiError('rejected', code, 'Clippeak n’est pas encore validé par TikTok : le compte doit être en privé pour recevoir la publication.')
  if (status === 429 || status >= 500) return new TiktokApiError('transient', code, detail)
  return new TiktokApiError('rejected', code, detail)
}

export async function tiktokJson<T>(fetchFn: FetchFn, url: string, accessToken: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetchFn(url, { method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json; charset=UTF-8' }, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new TiktokApiError('transient', '', 'Connexion à TikTok impossible')
  }
  const json = await response.json().catch(() => ({})) as { data?: T, error?: { code?: string, message?: string } }
  const code = json.error?.code ?? ''
  if (!response.ok || (code && code !== 'ok')) throw classifyTiktokError(response.status, code, json.error?.message ?? '')
  return (json.data ?? {}) as T
}

// Informations du createur : a lire AVANT d'afficher l'ecran de publication (regle de TikTok) : visibilites permises, interactions
// desactivees par le compte, duree maximale, et si le compte peut publier maintenant.
export async function queryCreatorInfo(fetchFn: FetchFn, accessToken: string, apiBase = TIKTOK_API): Promise<TiktokCreatorInfo> {
  const data = await tiktokJson<{
    creator_nickname?: string, creator_username?: string, creator_avatar_url?: string, privacy_level_options?: string[]
    comment_disabled?: boolean, duet_disabled?: boolean, stitch_disabled?: boolean, max_video_post_duration_sec?: number
  }>(fetchFn, `${apiBase}/v2/post/publish/creator_info/query/`, accessToken)
  return {
    nickname: data.creator_nickname ?? '',
    username: data.creator_username ?? '',
    avatarUrl: data.creator_avatar_url ?? null,
    privacyOptions: (data.privacy_level_options ?? []).filter((o): o is TiktokPrivacyLevel => (TIKTOK_PRIVACY_LEVELS as readonly string[]).includes(o)),
    commentDisabled: Boolean(data.comment_disabled),
    duetDisabled: Boolean(data.duet_disabled),
    stitchDisabled: Boolean(data.stitch_disabled),
    maxVideoDurationSec: Number(data.max_video_post_duration_sec ?? 0)
  }
}

// Controle les choix du streamer contre ce que TikTok autorise pour son compte. Renvoie un message d'erreur, ou null si tout est bon.
export function checkPostOptions(options: TiktokPostOptions, creator: TiktokCreatorInfo, clipDurationSec: number | null): string | null {
  if (!options.title.trim()) return 'Ajoute un titre.'
  if (options.title.length > 2200) return 'Le titre est trop long (2 200 caractères au plus).'
  if (!creator.privacyOptions.includes(options.privacyLevel)) return 'Cette visibilité n’est pas permise pour ce compte TikTok.'
  if (options.disableComment === false && creator.commentDisabled) return 'Les commentaires sont désactivés sur ce compte TikTok.'
  if (options.disableDuet === false && creator.duetDisabled) return 'Les duos sont désactivés sur ce compte TikTok.'
  if (options.disableStitch === false && creator.stitchDisabled) return 'Les stitchs sont désactivés sur ce compte TikTok.'
  if (options.brandContent && options.privacyLevel === 'SELF_ONLY') return 'Un contenu de marque ne peut pas être privé.'
  if (clipDurationSec && creator.maxVideoDurationSec && clipDurationSec > creator.maxVideoDurationSec) return `Ce clip dépasse la durée permise par ton compte TikTok (${creator.maxVideoDurationSec} s).`
  return null
}
