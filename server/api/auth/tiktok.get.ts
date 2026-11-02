import { cookieOptions } from '../../utils/studioLogin'
import { tiktokConfig } from '../../utils/publishConfig'
import { requireStudioActor } from '../../utils/studioAuth'
import { newToken } from '../../utils/clipping/twitchLogin'
import { buildTiktokAuthUrl } from '../../utils/clipping/tiktokApi'

const TIKTOK_STATE_COOKIE = 'clippeak_oauth_tt'

// Debut de « Connecter TikTok » : reserve a un streamer connecte. Un etat aleatoire (anti-falsification) est garde 10 minutes dans
// un cookie, puis le navigateur part vers TikTok.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event).catch(() => null)
  if (!actor) return sendRedirect(event, '/connexion', 302)
  if (actor.admin) return sendRedirect(event, '/studio?connect=admin', 302)
  const config = tiktokConfig(event)
  if (!config.configured) return sendRedirect(event, '/studio?connect=unavailable', 302)
  const state = newToken()
  setCookie(event, TIKTOK_STATE_COOKIE, state, cookieOptions(event, 600, '/api/auth'))
  return sendRedirect(event, buildTiktokAuthUrl({ clientKey: config.clientKey, redirectUri: config.redirectUri, state }), 302)
})
