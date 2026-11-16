import type { H3Event } from 'h3'
import { prisma } from './prisma'
import { instagramConfig, tokenKey } from './publishConfig'
import { decryptToken } from './clipping/tokenVault'
import { instagramTokenExpired } from './clipping/instagramApi'

// Jeton Instagram en clair d'une chaine, pour une lecture a la demande du streamer (jamais renvoye au navigateur). Null si Instagram n'est pas
// connecte, pas configure, ou si l'acces a expire (le streamer doit reconnecter).
export async function instagramAccessFor(event: H3Event, channelId: string): Promise<{ connectionId: string, token: string, graphBase: string | undefined } | null> {
  const config = instagramConfig(event)
  const key = tokenKey()
  if (!config.configured || !key) return null
  const connection = await prisma.platformConnection.findUnique({ where: { channelId_platform: { channelId, platform: 'instagram' } } })
  if (!connection || instagramTokenExpired(connection.expiresAt, Date.now())) return null
  try {
    return { connectionId: connection.id, token: decryptToken(connection.accessTokenEnc, key), graphBase: config.graphBase }
  } catch {
    return null
  }
}
