import type { H3Event } from 'h3'
import { readEnv } from './env'
import { parseKey } from './clipping/tokenVault'

// Cle de chiffrement des jetons de plateformes : sans elle, aucun compte ne peut etre connecte.
export function tokenKey(): Buffer | null {
  try { return parseKey(readEnv('CLIPPEAK_TOKEN_KEY')) } catch { return null }
}

// Reglages de la connexion YouTube. L'adresse de retour doit etre declaree telle quelle dans la console Google Cloud.
export function youtubeConfig(event: H3Event) {
  const clientId = readEnv('GOOGLE_CLIENT_ID')
  const clientSecret = readEnv('GOOGLE_CLIENT_SECRET')
  const publicUrl = readEnv('CLIPPEAK_PUBLIC_URL').replace(/\/+$/, '')
  const origin = publicUrl || `${getRequestProtocol(event, { xForwardedProto: true })}://${getRequestHost(event, { xForwardedHost: true })}`
  const redirectUri = readEnv('GOOGLE_REDIRECT_URL') || `${origin}/api/auth/youtube/callback`
  return { clientId, clientSecret, redirectUri, configured: Boolean(clientId && clientSecret && tokenKey()) }
}

// Reglages de la connexion TikTok. L'adresse de retour doit etre declaree telle quelle dans le portail TikTok for Developers.
export function tiktokConfig(event: H3Event) {
  const clientKey = readEnv('TIKTOK_CLIENT_KEY')
  const clientSecret = readEnv('TIKTOK_CLIENT_SECRET')
  const publicUrl = readEnv('CLIPPEAK_PUBLIC_URL').replace(/\/+$/, '')
  const origin = publicUrl || `${getRequestProtocol(event, { xForwardedProto: true })}://${getRequestHost(event, { xForwardedHost: true })}`
  const redirectUri = readEnv('TIKTOK_REDIRECT_URL') || `${origin}/api/auth/tiktok/callback`
  return { clientKey, clientSecret, redirectUri, apiBase: readEnv('TIKTOK_API_BASE_URL') || undefined, configured: Boolean(clientKey && clientSecret && tokenKey()) }
}

// Reglages de la connexion Instagram (« Instagram API with Unified Login »). `appId` et `appSecret` sont ceux de l'application META (Parametres de
// l'app > General). `configId` est l'identifiant de la « configuration » creee dans Instagram > API setup with Unified login (ce n'est pas un secret).
// L'adresse de retour doit etre declaree telle quelle sur cette configuration.
export function instagramConfig(event: H3Event) {
  const appId = readEnv('INSTAGRAM_APP_ID')
  const appSecret = readEnv('INSTAGRAM_APP_SECRET')
  const configId = readEnv('INSTAGRAM_CONFIG_ID')
  const publicUrl = readEnv('CLIPPEAK_PUBLIC_URL').replace(/\/+$/, '')
  const origin = publicUrl || `${getRequestProtocol(event, { xForwardedProto: true })}://${getRequestHost(event, { xForwardedHost: true })}`
  const redirectUri = readEnv('INSTAGRAM_REDIRECT_URL') || `${origin}/api/auth/instagram/callback`
  return {
    appId, appSecret, configId, redirectUri,
    oauthBase: readEnv('INSTAGRAM_OAUTH_BASE_URL') || undefined,
    graphBase: readEnv('INSTAGRAM_API_BASE_URL') || undefined,
    // Meta telecharge la video depuis l'adresse publique du site : sans elle, la publication ne peut pas marcher.
    configured: Boolean(appId && appSecret && configId && tokenKey() && publicUrl)
  }
}
