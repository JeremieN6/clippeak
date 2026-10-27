import type { H3Event } from 'h3'
import { readEnv } from './env'

// Reglages de la connexion Twitch. L'adresse de retour doit etre declaree telle quelle dans la console developpeur Twitch.
export function loginConfig(event: H3Event) {
  const clientId = readEnv('TWITCH_CLIENT_ID')
  const clientSecret = readEnv('TWITCH_CLIENT_SECRET')
  const publicUrl = readEnv('CLIPPEAK_PUBLIC_URL').replace(/\/+$/, '')
  const origin = publicUrl || `${getRequestProtocol(event, { xForwardedProto: true })}://${getRequestHost(event, { xForwardedHost: true })}`
  const redirectUri = readEnv('TWITCH_LOGIN_REDIRECT_URL') || `${origin}/api/auth/twitch/callback`
  return { clientId, clientSecret, redirectUri, configured: Boolean(clientId && clientSecret) }
}

// Cookies de connexion : illisibles par le JavaScript de la page, jamais envoyes depuis un autre site (SameSite=Lax),
// « Secure » des que la page est en HTTPS.
export function cookieOptions(event: H3Event, maxAgeSec: number, path = '/') {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: getRequestProtocol(event, { xForwardedProto: true }) === 'https',
    path,
    maxAge: maxAgeSec
  }
}
