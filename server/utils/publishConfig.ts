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
