import { prisma } from '../../../utils/prisma'
import { requireStudioAdmin } from '../../../utils/studioAuth'
import { blockTally, closeDueBlocks } from '../../../utils/roadmapStore'

// Vue admin de « Prochainement » : fonctions, blocs de vote (avec les totaux : l'admin les voit toujours) et idees des streamers.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  await closeDueBlocks()
  const [features, blocks, ideas] = await Promise.all([
    prisma.roadmapFeature.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.roadmapBlock.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { featureA: true, featureB: true, _count: { select: { votes: true } } } }),
    prisma.roadmapIdea.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 100, include: { channel: { select: { displayName: true } } } })
  ])
  const rows = []
  for (const b of blocks) {
    const t = await blockTally(b)
    rows.push({ id: b.id, status: b.status, endsAt: b.endsAt, decidedBy: b.decidedBy, winnerId: b.winnerId, votes: b._count.votes, a: { id: b.featureAId, title: b.featureA.title, total: t.a }, b: { id: b.featureBId, title: b.featureB.title, total: t.b } })
  }
  return {
    features: features.map(f => ({ id: f.id, title: f.title, description: f.description, status: f.status, carriedVotes: f.carriedVotes })),
    blocks: rows,
    ideas: ideas.map(i => ({ id: i.id, text: i.text, status: i.status, createdAt: i.createdAt, channel: i.channel.displayName }))
  }
})
