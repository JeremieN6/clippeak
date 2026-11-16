import type { H3Event } from 'h3'
import { prisma } from './prisma'
import { instagramConfig, tokenKey } from './publishConfig'
import { decryptToken, encryptToken } from './clipping/tokenVault'
import { instagramRefreshDue, refreshInstagramToken } from './clipping/instagramApi'

// Renouvelle le jeton Instagram d'une chaine quand il lui reste moins de 50 jours. Renvoie false seulement si l'acces a EXPIRE (le streamer doit
// reconnecter) ; un renouvellement qui echoue alors que le jeton est encore valable n'est pas une erreur : il sera retente.
export async function refreshInstagramIfDue(event: H3Event, channelId: string): Promise<boolean> {
  const connection = await prisma.platformConnection.findUnique({ where: { channelId_platform: { channelId, platform: 'instagram' } } })
  if (!connection) return true
  const state = instagramRefreshDue(connection.expiresAt, Date.now())
  if (state === 'expired') return false
  const config = instagramConfig(event)
  const key = tokenKey()
  if (state === 'fresh' || !config.configured || !key) return true
  try {
    const fresh = await refreshInstagramToken(fetch, { token: decryptToken(connection.accessTokenEnc, key), graphBase: config.graphBase })
    const enc = encryptToken(fresh.accessToken, key)
    await prisma.platformConnection.update({ where: { id: connection.id }, data: { accessTokenEnc: enc, refreshTokenEnc: enc, expiresAt: fresh.expiresAt } })
  } catch { /* encore valable : on retentera a la prochaine ouverture */ }
  return true
}
