import { cookieOptions, loginConfig } from '../../utils/studioLogin'
import { buildAuthorizeUrl, newToken, STATE_COOKIE } from '../../utils/clipping/twitchLogin'

// Debut de « Se connecter avec Twitch » : un etat aleatoire (anti-falsification) est garde dans un cookie de 10 minutes,
// puis le navigateur part vers Twitch.
export default defineEventHandler((event) => {
  const config = loginConfig(event)
  if (!config.configured) throw createError({ statusCode: 503, statusMessage: 'Connexion Twitch non configuree' })
  const state = newToken()
  setCookie(event, STATE_COOKIE, state, cookieOptions(event, 600, '/api/auth'))
  return sendRedirect(event, buildAuthorizeUrl({ clientId: config.clientId, redirectUri: config.redirectUri, state }), 302)
})
