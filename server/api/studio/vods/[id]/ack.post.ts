import { prisma } from '../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'

// Le streamer confirme avoir remis sa VOD comme avant : la carte disparait. Seulement une fois les extraits enregistres.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  const vod = await prisma.vod.findUnique({ where: { id }, select: { channelId: true, restrictedAt: true, sourcesSavedAt: true } })
  if (!vod) throw createError({ statusCode: 404, statusMessage: 'VOD introuvable' })
  assertChannel(actor, vod.channelId)
  if (!vod.restrictedAt || !vod.sourcesSavedAt) throw createError({ statusCode: 409, statusMessage: 'Clippeak n’a pas encore fini : garde la VOD publique pour le moment' })
  await prisma.vod.update({ where: { id }, data: { restoreAckAt: new Date() } })
  return { ok: true }
})
