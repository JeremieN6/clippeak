import { prisma } from '../../../utils/prisma'
import { requireStudioAdmin } from '../../../utils/studioAuth'

// VODs ajoutées à la main (admin seulement) avec leur avancement : en attente, analyse, terminée (et combien de clips), échec.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const vods = await prisma.vod.findMany({
    where: { source: 'manual' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, twitchVodId: true, url: true, title: true, status: true, createdAt: true,
      channel: { select: { displayName: true } },
      moments: { select: { _count: { select: { jobs: true } } } }
    }
  })
  return {
    vods: vods.map(v => ({
      id: v.id,
      twitchVodId: v.twitchVodId,
      url: v.url,
      title: v.title,
      status: v.status,
      createdAt: v.createdAt,
      channel: v.channel.displayName,
      moments: v.moments.length,
      clips: v.moments.reduce((sum, m) => sum + m._count.jobs, 0)
    }))
  }
})
