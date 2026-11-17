import { prisma } from '../../../utils/prisma'
import { instagramConfig } from '../../../utils/publishConfig'
import { isDemoTwitchId, isTestTwitchId } from '../../../utils/demoChannel'
import { finishOAuthCallback } from '../../../utils/finishOAuthCallback'
import { encryptToken } from '../../../utils/clipping/tokenVault'
import { exchangeInstagramCode, fetchInstagramProfile } from '../../../utils/clipping/instagramApi'

// Retour de Meta (connexion unifiee) : verifie l'etat et la session, echange le code, range le jeton de l'entreprise CHIFFRE pour la chaine du
// streamer connecte. Le meme jeton sert d'acces et de « renouvellement » (il n'y a pas de jeton de renouvellement separe).
export default defineEventHandler((event) => {
  const config = instagramConfig(event)
  return finishOAuthCallback(event, {
    platform: 'instagram',
    stateCookie: 'clippeak_oauth_ig',
    config,
    cleanCode: code => code.replace(/#_$/, ''),
    // Jamais de publication pour une chaine de test ou de demonstration (donnees d'amis) : pas de compte Instagram connecte non plus.
    async precheck(channelId) {
      const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { twitchId: true } })
      return !channel || isDemoTwitchId(channel.twitchId) || isTestTwitchId(channel.twitchId) ? 'unavailable' : null
    },
    async connect(code, key) {
      const tokens = await exchangeInstagramCode(fetch, { appId: config.appId, appSecret: config.appSecret, code, redirectUri: config.redirectUri, graphBase: config.graphBase })
      const profile = await fetchInstagramProfile(fetch, tokens.accessToken, config.graphBase)
      // Aucun compte professionnel partage pendant la connexion : rien a publier.
      if (!profile) return 'instagram-personal'
      const enc = encryptToken(tokens.accessToken, key)
      return { accessTokenEnc: enc, refreshTokenEnc: enc, expiresAt: tokens.expiresAt, scopes: 'instagram_basic,instagram_content_publish', accountName: profile.username || null, externalId: profile.userId.slice(0, 40) }
    }
  })
})
