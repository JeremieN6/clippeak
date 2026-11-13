import { prisma } from '../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'
import { READABLE_VOD_STATUSES, longSettings, proposalView } from '../../../../utils/longProposals'

// Extraits longs YouTube : le reglage de la chaine, les lives parmi lesquels choisir un passage (les plus recents, lisibles par Clippeak)
// et les propositions d'extraits (proposees, ignorees, en preparation, dans « A valider »).
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const settings = await longSettings(id)
  const vods = await prisma.vod.findMany({
    where: { channelId: id, status: { in: [...READABLE_VOD_STATUSES] } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, title: true, startedAt: true, endedAt: true, createdAt: true }
  })
  const proposals = await prisma.longProposal.findMany({
    where: { channelId: id },
    orderBy: [{ score: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 200,
    include: { vod: { select: { id: true, twitchVodId: true, title: true, startedAt: true, createdAt: true } }, clipJob: { select: { status: true } } }
  })
  return {
    ...settings,
    vods: vods.map(v => ({
      id: v.id,
      title: v.title,
      startedAt: v.startedAt ?? v.createdAt,
      // Duree approximative du live (debut et fin connus), pour avertir si le passage choisi la depasse.
      durationSec: v.startedAt && v.endedAt ? Math.round((v.endedAt.getTime() - v.startedAt.getTime()) / 1000) : null
    })),
    proposals: proposals.map(proposalView).filter((p): p is NonNullable<typeof p> => p !== null)
  }
})
