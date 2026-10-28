import type { H3Event } from 'h3'
import { prisma } from '../../../utils/prisma'
import { readEnv } from '../../../utils/env'
import { requireStudioActor } from '../../../utils/studioAuth'
import { tokenKey, youtubeConfig } from '../../../utils/publishConfig'
import { safeEqual } from '../../../utils/clipping/adminAuth'
import { encryptToken } from '../../../utils/clipping/tokenVault'
import { exchangeGoogleCode } from '../../../utils/clipping/googleOAuth'

const STATE_COOKIE = 'clippeak_oauth_yt'
const back = (event: H3Event, result: string) => sendRedirect(event, `/studio?connect=${result}`, 302)

// Retour de Google : verifie l'etat et la session, echange le code, range les jetons CHIFFRES pour la chaine du streamer connecte.
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

  const config = youtubeConfig(event)
  const key = tokenKey()
  if (!config.configured || !key) return back(event, 'unavailable')

  try {
    const tokens = await exchangeGoogleCode(fetch, { clientId: config.clientId, clientSecret: config.clientSecret, code, redirectUri: config.redirectUri, tokenUrl: readEnv('GOOGLE_TOKEN_URL') || undefined })
    const data = {
      accessTokenEnc: encryptToken(tokens.accessToken, key),
      refreshTokenEnc: encryptToken(tokens.refreshToken, key),
      expiresAt: tokens.expiresAt,
      scopes: tokens.scope
    }
    await prisma.platformConnection.upsert({
      where: { channelId_platform: { channelId: actor.channelId, platform: 'youtube' } },
      update: data,
      create: { channelId: actor.channelId, platform: 'youtube', ...data }
    })
  } catch (error) {
    console.error('[youtube] connexion impossible', error instanceof Error ? error.message : error)
    return back(event, 'error')
  }
  return back(event, 'youtube')
})
