import { z } from 'zod'
import { prisma } from '../../../../utils/prisma'
import { parseId, assertChannel, requireStudioActor } from '../../../../utils/studioAuth'

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), caption: z.string().trim().max(2200).optional(), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal('reject'), note: z.string().trim().max(500).optional() }),
  // Nouveau rendu : le titre est grave dans la video, le modifier impose donc de la rendre a nouveau.
  z.object({ action: z.literal('requeue'), title: z.string().trim().min(1).max(120).optional(), replan: z.boolean().optional(), note: z.string().trim().max(500).optional() })
])

// Validation humaine : approuver ne publie RIEN et ne paie RIEN. Le clip est seulement marque "approved" ;
// la publication reste une action du streamer, en dehors de Clippeak.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Requete invalide' })
  const body = parsed.data

  const job = await prisma.clipJob.findUnique({ where: { id }, select: { status: true, moment: { select: { vod: { select: { channelId: true } } } } } })
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Clip introuvable' })
  assertChannel(actor, job.moment.vod.channelId)

  if (body.action === 'requeue') {
    if (job.status !== 'review' && job.status !== 'failed' && job.status !== 'rejected') {
      throw createError({ statusCode: 409, statusMessage: 'Ce clip ne peut pas etre remis en file' })
    }
    await prisma.clipJob.update({
      where: { id },
      data: {
        status: 'queued',
        error: null,
        reviewNote: body.note ?? null,
        ...(body.title ? { title: body.title } : {}),
        ...(body.replan ? { startSec: null, endSec: null, keepRanges: null as any } : {})
      }
    })
    return { status: 'queued' }
  }

  if (job.status !== 'review') throw createError({ statusCode: 409, statusMessage: 'Seuls les clips a valider peuvent etre approuves ou refuses' })
  const status = body.action === 'approve' ? 'approved' : 'rejected'
  await prisma.clipJob.update({
    where: { id },
    data: {
      status,
      reviewedAt: new Date(),
      reviewNote: body.note ?? null,
      ...(body.action === 'approve' && body.caption ? { caption: body.caption } : {})
    }
  })
  return { status }
})
