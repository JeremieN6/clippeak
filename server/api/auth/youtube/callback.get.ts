import { readEnv } from '../../../utils/env'
import { youtubeConfig } from '../../../utils/publishConfig'
import { finishOAuthCallback } from '../../../utils/finishOAuthCallback'
import { encryptToken } from '../../../utils/clipping/tokenVault'
import { exchangeGoogleCode } from '../../../utils/clipping/googleOAuth'

// Retour de Google : verifie l'etat et la session, echange le code, range les jetons CHIFFRES pour la chaine du streamer connecte.
export default defineEventHandler((event) => {
  const config = youtubeConfig(event)
  return finishOAuthCallback(event, {
    platform: 'youtube',
    stateCookie: 'clippeak_oauth_yt',
    config,
    async connect(code, key) {
      const tokens = await exchangeGoogleCode(fetch, { clientId: config.clientId, clientSecret: config.clientSecret, code, redirectUri: config.redirectUri, tokenUrl: readEnv('GOOGLE_TOKEN_URL') || undefined })
      return {
        accessTokenEnc: encryptToken(tokens.accessToken, key),
        refreshTokenEnc: encryptToken(tokens.refreshToken, key),
        expiresAt: tokens.expiresAt,
        scopes: tokens.scope
      }
    }
  })
})
