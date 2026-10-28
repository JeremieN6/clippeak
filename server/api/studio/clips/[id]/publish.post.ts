import { z } from 'zod'
import { prisma } from '../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'
import { MAX_SCHEDULE_DAYS, PUBLISH_PLATFORMS } from '../../../../utils/clipping/publishing'

const bodySchema = z.object({ platform: z.enum(PUBLISH_PLATFORMS), at: z.string().datetime({ offset: true }).optional() })

// Programme (ou lance) la publication d'un clip APPROUVE sur une plateforme connectee. C'est la seule porte d'entree de la
// publication : une action explicite du streamer, jamais deduite de l'approbation. Sans heure : maintenant.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Plateforme ou heure invalide' })
  const { platform } = parsed.data

  const job = await prisma.clipJob.findUnique({ where: { id }, select: { status: true, outputPath: true, moment: { select: { vod: { select: { channelId: true } } } } } })
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Clip introuvable' })
  const channelId = job.moment.vod.channelId
  assertChannel(actor, channelId)
  if (job.status !== 'approved') throw createError({ statusCode: 409, statusMessage: 'Approuve d’abord le clip pour pouvoir le publier' })
  if (!job.outputPath) throw createError({ statusCode: 409, statusMessage: 'Ce clip n’a pas de vidéo à publier' })
  const connection = await prisma.platformConnection.findUnique({ where: { channelId_platform: { channelId, platform } }, select: { id: true } })
  if (!connection) throw createError({ statusCode: 409, statusMessage: 'Connecte d’abord ton compte à cette plateforme' })

  const now = Date.now()
  const requested = parsed.data.at ? new Date(parsed.data.at).getTime() : now
  if (requested > now + MAX_SCHEDULE_DAYS * 24 * 3600 * 1000) throw createError({ statusCode: 400, statusMessage: `Programme dans les ${MAX_SCHEDULE_DAYS} jours qui viennent` })
  const scheduledAt = new Date(Math.max(requested, now))

  const existing = await prisma.publication.findUnique({ where: { clipJobId_platform: { clipJobId: id, platform } }, select: { id: true, status: true } })
  if (existing && (existing.status === 'publishing' || existing.status === 'published')) {
    throw createError({ statusCode: 409, statusMessage: existing.status === 'published' ? 'Ce clip est déjà publié sur cette plateforme' : 'Ce clip est en cours de publication' })
  }
  const publication = existing
    ? await prisma.publication.update({ where: { id: existing.id }, data: { status: 'scheduled', scheduledAt, attempts: 0, error: null } })
    : await prisma.publication.create({ data: { clipJobId: id, platform, scheduledAt } })
  return { id: publication.id, status: publication.status, scheduledAt: publication.scheduledAt }
})
