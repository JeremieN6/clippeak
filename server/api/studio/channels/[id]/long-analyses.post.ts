import { z } from 'zod'
import { prisma } from '../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor, uuidSchema } from '../../../../utils/studioAuth'
import { READABLE_VOD_STATUSES, longSettings } from '../../../../utils/longProposals'

const bodySchema = z.object({ vodId: uuidSchema })

// « Analyser ce live » : met en file l'analyse d'un live termine. Une seule analyse a la fois par chaine (elle occupe longtemps le serveur).
// Relancer une analyse finie, en echec ou impossible la remet en file ; si la transcription est complete elle est reutilisee.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Choisis un live à analyser.' })

  if (!(await longSettings(id)).enabled) throw createError({ statusCode: 409, statusMessage: 'Active d’abord les extraits longs dans les réglages.' })
  const vod = await prisma.vod.findFirst({ where: { id: parsed.data.vodId, channelId: id }, select: { id: true, status: true } })
  if (!vod) throw createError({ statusCode: 404, statusMessage: 'Live introuvable' })
  if (vod.status === 'live') throw createError({ statusCode: 409, statusMessage: 'Ce live est encore en cours : lance l’analyse quand il est terminé.' })
  if (vod.status === 'blocked') throw createError({ statusCode: 409, statusMessage: 'La VOD de ce live est réservée aux abonnés : rends-la publique sur Twitch, puis réessaie.' })
  if (!(READABLE_VOD_STATUSES as readonly string[]).includes(vod.status)) throw createError({ statusCode: 409, statusMessage: 'Ce live n’est pas encore (ou plus) lisible par Clippeak.' })

  const busy = await prisma.longAnalysis.findFirst({ where: { channelId: id, status: { in: ['queued', 'running'] } }, select: { vodId: true } })
  if (busy) throw createError({ statusCode: 409, statusMessage: busy.vodId === vod.id ? 'L’analyse de ce live est déjà en cours.' : 'Une autre analyse est déjà en cours : attends qu’elle soit terminée.' })

  const existing = await prisma.longAnalysis.findUnique({ where: { vodId: vod.id }, select: { id: true, status: true, transcribedSec: true, durationSec: true } })
  if (existing) {
    // Transcription complete : on ne la refait pas. Sinon on repart de ce qui est deja transcrit.
    await prisma.longAnalysis.update({ where: { id: existing.id }, data: { status: 'queued', error: null, finishedAt: null } })
    return { status: 'queued', resumed: existing.transcribedSec > 0 }
  }
  await prisma.longAnalysis.create({ data: { channelId: id, vodId: vod.id } })
  return { status: 'queued', resumed: false }
})
