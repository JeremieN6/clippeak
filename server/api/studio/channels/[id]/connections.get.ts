import { prisma } from '../../../../utils/prisma'
import { refreshInstagramIfDue } from '../../../../utils/instagramAccess'
import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'
import { instagramConfig, tiktokConfig, youtubeConfig } from '../../../../utils/publishConfig'

// Plateformes de publication : laquelle est disponible chez Clippeak, laquelle est connectee pour cette chaine.
// Les jetons ne sortent jamais du serveur.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const rows = await prisma.platformConnection.findMany({ where: { channelId: id }, select: { platform: true, accountName: true, createdAt: true, expiresAt: true } })
  const byPlatform = new Map(rows.map(r => [r.platform, r]))
  const youtube = youtubeConfig(event).configured
  const tiktok = tiktokConfig(event).configured
  const instagram = instagramConfig(event).configured
  // Le jeton Instagram dure 60 jours : on le renouvelle quand le streamer ouvre son studio, avant qu'il n'expire.
  const instagramExpired = byPlatform.has('instagram') ? !(await refreshInstagramIfDue(event, id)) : false
  return {
    connections: [
      { platform: 'youtube', available: youtube, connected: byPlatform.has('youtube'), accountName: byPlatform.get('youtube')?.accountName ?? null },
      { platform: 'tiktok', available: tiktok, connected: byPlatform.has('tiktok'), accountName: byPlatform.get('tiktok')?.accountName ?? null },
      { platform: 'instagram', available: instagram, connected: byPlatform.has('instagram'), accountName: byPlatform.get('instagram')?.accountName ?? null, ...(instagramExpired ? { needsReconnect: true } : {}) }
    ]
  }
})
