import { prisma } from '../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'
import { LONG_DEFAULT_MAX_SEC, clampLongMax } from '../../../../utils/clipping/longExtract'

// Extraits longs YouTube : le reglage de la chaine et les lives parmi lesquels choisir un passage (les plus recents, lisibles par Clippeak).
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const settings = await prisma.streamerSettings.findUnique({ where: { channelId: id }, select: { longExtracts: true, longExtractMaxSec: true } })
  const vods = await prisma.vod.findMany({
    where: { channelId: id, status: { in: ['ended', 'analyzing', 'done'] } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, title: true, startedAt: true, endedAt: true, createdAt: true }
  })
  return {
    enabled: settings?.longExtracts ?? false,
    maxSec: clampLongMax(settings?.longExtractMaxSec ?? LONG_DEFAULT_MAX_SEC),
    vods: vods.map(v => ({
      id: v.id,
      title: v.title,
      startedAt: v.startedAt ?? v.createdAt,
      // Duree approximative du live (debut et fin connus), pour avertir si le passage choisi la depasse.
      durationSec: v.startedAt && v.endedAt ? Math.round((v.endedAt.getTime() - v.startedAt.getTime()) / 1000) : null
    }))
  }
})
