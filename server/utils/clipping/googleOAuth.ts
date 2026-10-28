type FetchFn = typeof fetch

export const YOUTUBE_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload'

// Adresse d'autorisation Google : portee minimale (publier des videos), acces hors ligne pour pouvoir publier a l'heure programmee,
// consentement redemande pour recevoir a coup sur un jeton de renouvellement.
export function buildGoogleAuthUrl(params: { clientId: string, redirectUri: string, state: string }): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', YOUTUBE_UPLOAD_SCOPE)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', params.state)
  return url.toString()
}

export interface GoogleTokens {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  scope: string
}

// Echange le code d'autorisation contre les jetons. Les messages d'erreur ne contiennent jamais de jeton ni de secret.
export async function exchangeGoogleCode(fetchFn: FetchFn, params: { clientId: string, clientSecret: string, code: string, redirectUri: string, tokenUrl?: string, now?: () => number }): Promise<GoogleTokens> {
  const response = await fetchFn(params.tokenUrl ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: params.clientId, client_secret: params.clientSecret, code: params.code, redirect_uri: params.redirectUri, grant_type: 'authorization_code' })
  })
  if (!response.ok) throw new Error(`Google a refusé le code (HTTP ${response.status})`)
  const body = await response.json() as { access_token?: string, refresh_token?: string, expires_in?: number, scope?: string }
  if (!body.access_token) throw new Error('Google n’a pas renvoyé d’accès')
  if (!body.refresh_token) throw new Error('Google n’a pas renvoyé de jeton de renouvellement')
  if (!(body.scope ?? '').includes(YOUTUBE_UPLOAD_SCOPE)) throw new Error('Le droit de publier n’a pas été accordé')
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date((params.now ?? Date.now)() + (body.expires_in ?? 3600) * 1000),
    scope: body.scope ?? ''
  }
}

// Retire l'autorisation chez Google (au mieux : un echec n'empeche pas la deconnexion chez nous).
export async function revokeGoogleToken(fetchFn: FetchFn, token: string): Promise<void> {
  try {
    await fetchFn('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) })
  } catch { /* au mieux */ }
}
