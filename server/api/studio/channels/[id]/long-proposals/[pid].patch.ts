import { z } from 'zod'
import { prisma } from '../../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor } from '../../../../../utils/studioAuth'
import { longSettings, rangeProblem } from '../../../../../utils/longProposals'

const bodySchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  startSec: z.number().min(0).max(24 * 3600).optional(),
  endSec: z.number().min(0).max(24 * 3600).optional(),
  // true : ignorer la proposition ; false : la remettre (« Annuler »).
  ignored: z.boolean().optional()
})

// Modifie une proposition pas encore preparee : titre, debut et fin (« Ajuster »), ou l'ignorer / la remettre.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  const pid = parseId(getRouterParam(event, 'pid'))
  assertChannel(actor, id)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Modification invalide.' })
  const body = parsed.data

  const proposal = await prisma.longProposal.findFirst({ where: { id: pid, channelId: id }, include: { vod: { select: { startedAt: true, endedAt: true } } } })
  if (!proposal) throw createError({ statusCode: 404, statusMessage: 'Proposition introuvable' })
  if (proposal.status === 'prepared') throw createError({ statusCode: 409, statusMessage: 'Cet extrait est déjà en préparation.' })

  const startSec = body.startSec ?? proposal.startSec
  const endSec = body.endSec ?? proposal.endSec
  if (body.startSec !== undefined || body.endSec !== undefined) {
    const problem = rangeProblem(proposal.vod, (await longSettings(id)).maxSec, startSec, endSec)
    if (problem) throw createError({ statusCode: 400, statusMessage: problem })
  }
  await prisma.longProposal.update({
    where: { id: pid },
    data: { ...(body.title ? { title: body.title } : {}), startSec, endSec, ...(body.ignored === undefined ? {} : { status: body.ignored ? 'ignored' : 'proposed' }) }
  })
  return { ok: true }
})
