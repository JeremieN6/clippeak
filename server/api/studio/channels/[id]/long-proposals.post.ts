import { z } from 'zod'
import { prisma } from '../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor, uuidSchema } from '../../../../utils/studioAuth'
import { READABLE_VOD_STATUSES, defaultTitle, longSettings, rangeProblem } from '../../../../utils/longProposals'
import { LONG_LOCKED_MESSAGE } from '../../../../utils/clipping/longAccess'

const bodySchema = z.object({
  vodId: uuidSchema,
  startSec: z.number().min(0).max(24 * 3600),
  endSec: z.number().min(0).max(24 * 3600),
  title: z.string().trim().max(100).optional()
})

// Ajoute a la main une proposition d'extrait long : un passage d'un de ses lives. Rien n'est rendu ni publie : le streamer la prepare ensuite.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Choisis un live, un début et une fin.' })
  const { vodId, startSec, endSec } = parsed.data

  const settings = await longSettings(id)
  if (!settings.allowed) throw createError({ statusCode: 403, statusMessage: LONG_LOCKED_MESSAGE })
  if (!settings.enabled) throw createError({ statusCode: 409, statusMessage: 'Active d’abord les extraits longs dans les réglages.' })
  const vod = await prisma.vod.findFirst({ where: { id: vodId, channelId: id }, select: { id: true, title: true, status: true, startedAt: true, endedAt: true } })
  if (!vod) throw createError({ statusCode: 404, statusMessage: 'Live introuvable' })
  if (!(READABLE_VOD_STATUSES as readonly string[]).includes(vod.status)) throw createError({ statusCode: 409, statusMessage: 'Ce live n’est pas encore (ou plus) lisible par Clippeak.' })
  const problem = rangeProblem(vod, settings.maxSec, startSec, endSec)
  if (problem) throw createError({ statusCode: 400, statusMessage: problem })

  const proposal = await prisma.longProposal.create({
    data: { channelId: id, vodId: vod.id, origin: 'manual', title: parsed.data.title || defaultTitle(vod.title, startSec), why: 'Passage ajouté à la main.', startSec, endSec }
  })
  return { id: proposal.id }
})
