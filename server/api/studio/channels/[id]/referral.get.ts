import { prisma } from '../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'
import { referralSummary } from '../../../../utils/clipping/prismaReferral'

// Parrainage du streamer : son lien personnel (/r/CODE), les chaines parrainees, le bonus de clips du mois et son plafond.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const channel = await prisma.channel.findUnique({ where: { id }, select: { twitchId: true } })
  // Pas de lien pour les chaines de demonstration et de test : leurs parrainages ne compteraient jamais.
  if (!channel || channel.twitchId === 'demo-clippeak' || channel.twitchId.startsWith('test-')) throw createError({ statusCode: 404, statusMessage: 'Parrainage indisponible pour cette chaine' })
  return referralSummary(prisma, id)
})
