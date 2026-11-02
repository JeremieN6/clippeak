import type { H3Event } from 'h3'
import { prisma } from '../../../utils/prisma'
import { requireStudioActor } from '../../../utils/studioAuth'
import { tiktokConfig, tokenKey } from '../../../utils/publishConfig'
import { safeEqual } from '../../../utils/clipping/adminAuth'
import { encryptToken } from '../../../utils/clipping/tokenVault'
import { exchangeTiktokCode, fetchTiktokDisplayName } from '../../../utils/clipping/tiktokApi'

const STATE_COOKIE = 'clippeak_oauth_tt'
const back = (event: H3Event, result: string) => sendRedirect(event, `/studio?connect=${result}`, 302)

// Retour de TikTok : verifie l'etat et la session, echange le code, range les jetons CHIFFRES pour la chaine du streamer connecte.
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const expected = getCookie(event, STATE_COOKIE) ?? ''
  deleteCookie(event, STATE_COOKIE, { path: '/api/auth' })
  const actor = await requireStudioActor(event).catch(() => null)
  if (!actor) return sendRedirect(event, '/connexion', 302)
  if (actor.admin || !actor.channelId) return back(event, 'admin')

  if (query.error) return back(event, 'cancelled')
  const state = typeof query.state === 'string' ? query.state : ''
  const code = typeof query.code === 'string' ? query.code : ''
  if (!expected || !state || !safeEqual(state, expected) || !code) return back(event, 'error')

  const config = tiktokConfig(event)
  const key = tokenKey()
  if (!config.configured || !key) return back(event, 'unavailable')

  try {
    const tokens = await exchangeTiktokCode(fetch, { clientKey: config.clientKey, clientSecret: config.clientSecret, code, redirectUri: config.redirectUri, apiBase: config.apiBase })
    const data = {
      accessTokenEnc: encryptToken(tokens.accessToken, key),
      refreshTokenEnc: encryptToken(tokens.refreshToken, key),
      expiresAt: tokens.expiresAt,
      scopes: tokens.scope,
      accountName: await fetchTiktokDisplayName(fetch, tokens.accessToken, config.apiBase)
    }
    await prisma.platformConnection.upsert({
      where: { channelId_platform: { channelId: actor.channelId, platform: 'tiktok' } },
      update: data,
      create: { channelId: actor.channelId, platform: 'tiktok', ...data }
    })
  } catch (error) {
    console.error('[tiktok] connexion impossible', error instanceof Error ? error.message : error)
    return back(event, 'error')
  }
  return back(event, 'tiktok')
})
