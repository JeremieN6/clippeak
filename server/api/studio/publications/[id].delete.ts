import { prisma } from '../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor } from '../../../utils/studioAuth'

// Annule une publication programmee (ou abandonne une publication en echec). Une publication en cours ou deja faite ne s'annule pas ici.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  const publication = await prisma.publication.findUnique({ where: { id }, select: { status: true, clipJob: { select: { moment: { select: { vod: { select: { channelId: true } } } } } } } })
  if (!publication) throw createError({ statusCode: 404, statusMessage: 'Publication introuvable' })
  assertChannel(actor, publication.clipJob.moment.vod.channelId)
  if (publication.status !== 'scheduled' && publication.status !== 'failed') {
    throw createError({ statusCode: 409, statusMessage: publication.status === 'published' ? 'Ce clip est déjà publié' : 'Cette publication ne peut plus être annulée' })
  }
  await prisma.publication.update({ where: { id }, data: { status: 'cancelled' } })
  return { ok: true }
})
