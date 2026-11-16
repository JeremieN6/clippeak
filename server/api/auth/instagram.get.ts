import { cookieOptions } from '../../utils/studioLogin'
import { instagramConfig } from '../../utils/publishConfig'
import { requireStudioActor } from '../../utils/studioAuth'
import { newToken } from '../../utils/clipping/twitchLogin'
import { buildInstagramAuthUrl } from '../../utils/clipping/instagramApi'

const INSTAGRAM_STATE_COOKIE = 'clippeak_oauth_ig'

// Debut de « Connecter Instagram » : reserve a un streamer connecte. Un etat aleatoire (anti-falsification) est garde 10 minutes dans
// un cookie, puis le navigateur part vers Instagram.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event).catch(() => null)
  if (!actor) return sendRedirect(event, '/connexion', 302)
  if (actor.admin) return sendRedirect(event, '/studio?connect=admin', 302)
  const config = instagramConfig(event)
  if (!config.configured) return sendRedirect(event, '/studio?connect=unavailable', 302)
  const state = newToken()
  setCookie(event, INSTAGRAM_STATE_COOKIE, state, cookieOptions(event, 600, '/api/auth'))
  return sendRedirect(event, buildInstagramAuthUrl({ appId: config.appId, redirectUri: config.redirectUri, state }), 302)
})
