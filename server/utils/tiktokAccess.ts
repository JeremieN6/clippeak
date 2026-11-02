import type { H3Event } from 'h3'
import { prisma } from './prisma'
import { tiktokConfig, tokenKey } from './publishConfig'
import { decryptToken, encryptToken } from './clipping/tokenVault'
import { refreshTiktokTokens } from './clipping/tiktokApi'

// Jeton d'acces TikTok valide pour une chaine (renouvele et range chiffre si besoin), pour les routes du site qui interrogent TikTok
// avant l'ecran de publication. Renvoie null si le compte n'est pas connecte ou si TikTok a refuse le renouvellement (reconnecter).
export async function tiktokAccessFor(event: H3Event, channelId: string): Promise<string | null> {
  const config = tiktokConfig(event)
  const key = tokenKey()
  if (!config.configured || !key) return null
  const connection = await prisma.platformConnection.findUnique({ where: { channelId_platform: { channelId, platform: 'tiktok' } } })
  if (!connection) return null
  try {
    if (connection.expiresAt && connection.expiresAt.getTime() - Date.now() > 60_000) return decryptToken(connection.accessTokenEnc, key)
    if (!connection.refreshTokenEnc) return null
    const tokens = await refreshTiktokTokens(fetch, { clientKey: config.clientKey, clientSecret: config.clientSecret, refreshToken: decryptToken(connection.refreshTokenEnc, key), apiBase: config.apiBase })
    await prisma.platformConnection.update({ where: { id: connection.id }, data: { accessTokenEnc: encryptToken(tokens.accessToken, key), refreshTokenEnc: encryptToken(tokens.refreshToken, key), expiresAt: tokens.expiresAt } })
    return tokens.accessToken
  } catch {
    return null
  }
}
