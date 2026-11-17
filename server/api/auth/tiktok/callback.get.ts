import { tiktokConfig } from '../../../utils/publishConfig'
import { finishOAuthCallback } from '../../../utils/finishOAuthCallback'
import { encryptToken } from '../../../utils/clipping/tokenVault'
import { exchangeTiktokCode, fetchTiktokDisplayName } from '../../../utils/clipping/tiktokApi'

// Retour de TikTok : verifie l'etat et la session, echange le code, range les jetons CHIFFRES pour la chaine du streamer connecte.
export default defineEventHandler((event) => {
  const config = tiktokConfig(event)
  return finishOAuthCallback(event, {
    platform: 'tiktok',
    stateCookie: 'clippeak_oauth_tt',
    config,
    async connect(code, key) {
      const tokens = await exchangeTiktokCode(fetch, { clientKey: config.clientKey, clientSecret: config.clientSecret, code, redirectUri: config.redirectUri, apiBase: config.apiBase })
      return {
        accessTokenEnc: encryptToken(tokens.accessToken, key),
        refreshTokenEnc: encryptToken(tokens.refreshToken, key),
        expiresAt: tokens.expiresAt,
        scopes: tokens.scope,
        accountName: await fetchTiktokDisplayName(fetch, tokens.accessToken, config.apiBase)
      }
    }
  })
})
