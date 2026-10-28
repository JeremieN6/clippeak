import { prisma } from '../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'
import { youtubeConfig } from '../../../../utils/publishConfig'

// Plateformes de publication : laquelle est disponible chez Clippeak, laquelle est connectee pour cette chaine.
// Les jetons ne sortent jamais du serveur.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const rows = await prisma.platformConnection.findMany({ where: { channelId: id }, select: { platform: true, accountName: true, createdAt: true } })
  const byPlatform = new Map(rows.map(r => [r.platform, r]))
  const youtube = youtubeConfig(event).configured
  return {
    connections: [
      { platform: 'youtube', available: youtube, connected: byPlatform.has('youtube'), accountName: byPlatform.get('youtube')?.accountName ?? null },
      { platform: 'tiktok', available: false, connected: false, accountName: null },
      { platform: 'instagram', available: false, connected: false, accountName: null }
    ]
  }
})
