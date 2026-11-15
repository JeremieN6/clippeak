import type { H3Event } from 'h3'
import { prisma } from '../../../utils/prisma'
import { requireStudioActor } from '../../../utils/studioAuth'
import { instagramConfig, tokenKey } from '../../../utils/publishConfig'
import { isDemoTwitchId, isTestTwitchId } from '../../../utils/demoChannel'
import { safeEqual } from '../../../utils/clipping/adminAuth'
import { encryptToken } from '../../../utils/clipping/tokenVault'
import { exchangeInstagramCode, fetchInstagramProfile, isProfessionalAccount } from '../../../utils/clipping/instagramApi'

const STATE_COOKIE = 'clippeak_oauth_ig'
const back = (event: H3Event, result: string) => sendRedirect(event, result === 'error' ? '/studio?connect=error&platform=instagram' : `/studio?connect=${result}`, 302)

// Retour d'Instagram : verifie l'etat et la session, echange le code, range le jeton de 60 jours CHIFFRE pour la chaine du streamer connecte.
// Le meme jeton sert d'acces et de renouvellement (Instagram n'a pas de jeton de renouvellement separe).
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const expected = getCookie(event, STATE_COOKIE) ?? ''
  deleteCookie(event, STATE_COOKIE, { path: '/api/auth' })
  const actor = await requireStudioActor(event).catch(() => null)
  if (!actor) return sendRedirect(event, '/connexion', 302)
  if (actor.admin || !actor.channelId) return back(event, 'admin')

  if (query.error) return back(event, 'cancelled')
  const state = typeof query.state === 'string' ? query.state : ''
  const code = typeof query.code === 'string' ? query.code.replace(/#_$/, '') : ''
  if (!expected || !state || !safeEqual(state, expected) || !code) return back(event, 'error')

  const config = instagramConfig(event)
  const key = tokenKey()
  if (!config.configured || !key) return back(event, 'unavailable')

  // Jamais de publication pour une chaine de test ou de demonstration (donnees d'amis) : pas de compte Instagram connecte non plus.
  const channel = await prisma.channel.findUnique({ where: { id: actor.channelId }, select: { twitchId: true } })
  if (!channel || isDemoTwitchId(channel.twitchId) || isTestTwitchId(channel.twitchId)) return back(event, 'unavailable')

  try {
    const tokens = await exchangeInstagramCode(fetch, { appId: config.appId, appSecret: config.appSecret, code, redirectUri: config.redirectUri, oauthBase: config.oauthBase, graphBase: config.graphBase })
    const profile = await fetchInstagramProfile(fetch, tokens.accessToken, config.graphBase)
    if (!isProfessionalAccount(profile.accountType)) return back(event, 'instagram-personal')
    const enc = encryptToken(tokens.accessToken, key)
    const data = { accessTokenEnc: enc, refreshTokenEnc: enc, expiresAt: tokens.expiresAt, scopes: tokens.permissions || null, accountName: profile.username || null, externalId: (profile.userId || tokens.userId).slice(0, 40) }
    await prisma.platformConnection.upsert({
      where: { channelId_platform: { channelId: actor.channelId, platform: 'instagram' } },
      update: data,
      create: { channelId: actor.channelId, platform: 'instagram', ...data }
    })
  } catch (error) {
    console.error('[instagram] connexion impossible', error instanceof Error ? error.message : error)
    return back(event, 'error')
  }
  return back(event, 'instagram')
})
