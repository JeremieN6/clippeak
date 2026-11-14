import { prisma } from '../../../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor } from '../../../../../../utils/studioAuth'
import { READABLE_VOD_STATUSES, longSettings, rangeProblem } from '../../../../../../utils/longProposals'
import { LONG_LOCKED_MESSAGE } from '../../../../../../utils/clipping/longAccess'
import { formatClock } from '../../../../../../utils/clipping/longExtract'

// « Preparer l'extrait » : cree le moment et le rendu en file (meme file et meme worker que les clips). L'extrait revient ensuite dans « A valider ».
// Rien n'est publie : c'est une action separee du streamer.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  const pid = parseId(getRouterParam(event, 'pid'))
  assertChannel(actor, id)

  const settings = await longSettings(id)
  if (!settings.allowed) throw createError({ statusCode: 403, statusMessage: LONG_LOCKED_MESSAGE })
  if (!settings.enabled) throw createError({ statusCode: 409, statusMessage: 'Active d’abord les extraits longs dans les réglages.' })
  const proposal = await prisma.longProposal.findFirst({ where: { id: pid, channelId: id }, include: { vod: { select: { id: true, title: true, status: true, startedAt: true, endedAt: true } } } })
  if (!proposal) throw createError({ statusCode: 404, statusMessage: 'Proposition introuvable' })
  if (proposal.status === 'prepared') throw createError({ statusCode: 409, statusMessage: 'Cet extrait est déjà en préparation.' })
  if (!(READABLE_VOD_STATUSES as readonly string[]).includes(proposal.vod.status)) throw createError({ statusCode: 409, statusMessage: 'Ce live n’est pas encore (ou plus) lisible par Clippeak.' })
  const problem = rangeProblem(proposal.vod, settings.maxSec, proposal.startSec, proposal.endSec)
  if (problem) throw createError({ statusCode: 400, statusMessage: problem })

  const job = await prisma.$transaction(async (tx) => {
    const moment = await tx.moment.create({
      data: { vodId: proposal.vod.id, startSec: proposal.startSec, endSec: proposal.endSec, peakSec: proposal.startSec, score: proposal.score ?? 0, signals: {}, status: 'validated', kind: 'long', rationale: proposal.why ?? 'Extrait long', scorer: proposal.origin }
    })
    const created = await tx.clipJob.create({
      data: {
        momentId: moment.id, format: 'long', status: 'queued', title: proposal.title.slice(0, 100), startSec: proposal.startSec, endSec: proposal.endSec,
        keepRanges: [{ start: proposal.startSec, end: proposal.endSec }] as any,
        caption: `Extrait du live « ${proposal.vod.title ?? 'sans titre'} », de ${formatClock(proposal.startSec)} à ${formatClock(proposal.endSec)}.`
      }
    })
    await tx.longProposal.update({ where: { id: pid }, data: { status: 'prepared', clipJobId: created.id } })
    return created
  })
  return { id: job.id, status: job.status }
})
