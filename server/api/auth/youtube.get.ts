import { cookieOptions } from '../../utils/studioLogin'
import { youtubeConfig } from '../../utils/publishConfig'
import { requireStudioActor } from '../../utils/studioAuth'
import { newToken } from '../../utils/clipping/twitchLogin'
import { buildGoogleAuthUrl } from '../../utils/clipping/googleOAuth'

const YOUTUBE_STATE_COOKIE = 'clippeak_oauth_yt'

// Debut de « Connecter YouTube » : reserve a un streamer connecte. Un etat aleatoire (anti-falsification) est garde 10 minutes dans
// un cookie, puis le navigateur part vers Google.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event).catch(() => null)
  if (!actor) return sendRedirect(event, '/connexion', 302)
  if (actor.admin) return sendRedirect(event, '/studio?connect=admin', 302)
  const config = youtubeConfig(event)
  if (!config.configured) return sendRedirect(event, '/studio?connect=unavailable', 302)
  const state = newToken()
  setCookie(event, YOUTUBE_STATE_COOKIE, state, cookieOptions(event, 600, '/api/auth'))
  return sendRedirect(event, buildGoogleAuthUrl({ clientId: config.clientId, redirectUri: config.redirectUri, state }), 302)
})
