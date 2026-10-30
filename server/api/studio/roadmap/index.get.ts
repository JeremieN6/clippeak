import { prisma } from '../../../utils/prisma'
import { parseId, requireStudioActor } from '../../../utils/studioAuth'
import { closeDueBlocks, blockTally } from '../../../utils/roadmapStore'
import { outcome, IDEAS_PER_DAY } from '../../../utils/clipping/roadmap'

// Page « Prochainement » du streamer : bloc de vote en cours, fonctions en cours / livrees, et le resultat a annoncer.
// Les totaux ne sont montres qu'apres le vote (pas d'effet de suiveur). L'admin consulte avec ?channel=<id> (un vote lui est attribue).
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const q = getQuery(event).channel
  const channelId = actor.admin ? (typeof q === 'string' && q ? parseId(q) : null) : actor.channelId
  await closeDueBlocks()

  const block = await prisma.roadmapBlock.findFirst({
    where: { status: { in: ['open', 'needs_admin'] } },
    orderBy: { createdAt: 'desc' },
    include: { featureA: true, featureB: true }
  })
  const mine = block && channelId ? await prisma.roadmapVote.findUnique({ where: { blockId_channelId: { blockId: block.id, channelId } }, select: { featureId: true } }) : null
  const t = block && (mine || block.status === 'needs_admin') ? await blockTally(block) : null
  const pick = (f: { id: string, slug: string, title: string, description: string, carriedVotes: number }) => ({ id: f.id, slug: f.slug, title: f.title, description: f.description, carried: f.carriedVotes > 0 })

  const [others, delivered, ideasToday] = await Promise.all([
    prisma.roadmapFeature.findMany({ where: { status: { in: ['building', 'waiting_access', 'backlog'] } }, orderBy: { createdAt: 'asc' }, select: { id: true, slug: true, title: true, description: true, status: true } }),
    prisma.roadmapFeature.findMany({ where: { status: 'delivered' }, orderBy: { deliveredAt: 'desc' }, take: 10, select: { id: true, slug: true, title: true, description: true, deliveredAt: true } }),
    channelId ? prisma.roadmapIdea.count({ where: { channelId, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }) : Promise.resolve(0)
  ])

  // Resultat a annoncer : dernier bloc clos auquel ce streamer a vote et dont il n'a pas encore vu le resultat.
  const unseen = channelId
    ? await prisma.roadmapVote.findFirst({ where: { channelId, resultSeen: false, block: { status: 'closed' } }, orderBy: { updatedAt: 'desc' }, include: { block: { include: { featureA: true, featureB: true } } } })
    : null
  const notice = unseen?.block.winnerId
    ? { blockId: unseen.blockId, won: unseen.featureId === unseen.block.winnerId, winnerTitle: (unseen.block.winnerId === unseen.block.featureAId ? unseen.block.featureA : unseen.block.featureB).title }
    : null

  return {
    canVote: Boolean(channelId),
    block: block
      ? {
          id: block.id, status: block.status, endsAt: block.endsAt,
          features: [pick(block.featureA), pick(block.featureB)],
          myVote: mine?.featureId ?? null,
          totals: t ? { [block.featureAId]: t.a, [block.featureBId]: t.b } : null,
          tied: block.status === 'needs_admin' && t ? outcome(t) === 'tie' : false
        }
      : null,
    inProgress: others.filter(f => f.status !== 'backlog'),
    waiting: others.filter(f => f.status === 'backlog'),
    delivered,
    ideasLeft: Math.max(0, IDEAS_PER_DAY - ideasToday),
    notice
  }
})
