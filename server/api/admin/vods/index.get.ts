import { prisma } from '../../../utils/prisma'
import { requireStudioAdmin } from '../../../utils/studioAuth'
import { vodProgress } from '../../../utils/clipping/vodProgress'

// VODs ajoutées à la main (admin seulement) avec leur avancement : en attente, analyse, terminée (et combien de clips), échec.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const vods = await prisma.vod.findMany({
    where: { source: 'manual' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, twitchVodId: true, url: true, title: true, status: true, error: true, createdAt: true, startedAt: true, endedAt: true,
      channel: { select: { displayName: true } },
      moments: { select: { jobs: { select: { status: true } } } }
    }
  })
  return {
    vods: vods.map((v) => {
      const counts = { queued: 0, rendering: 0, review: 0, approved: 0, rejected: 0, failed: 0 }
      for (const m of v.moments) for (const j of m.jobs) counts[j.status]++
      const durationSec = v.startedAt && v.endedAt ? Math.max(0, (v.endedAt.getTime() - v.startedAt.getTime()) / 1000) : 0
      return {
      id: v.id,
      twitchVodId: v.twitchVodId,
      url: v.url,
      title: v.title,
      status: v.status,
      error: v.status === 'failed' || v.status === 'blocked' ? v.error : null,
      createdAt: v.createdAt,
      channel: v.channel.displayName,
      moments: v.moments.length,
      clips: v.moments.reduce((sum, m) => sum + m.jobs.length, 0),
      durationSec: Math.round(durationSec),
      progress: vodProgress(v.status, durationSec, counts)
      }
    })
  }
})
