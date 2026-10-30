import { prisma } from './prisma'
import { outcome, tally, isDue, resultNote, type Tally } from './clipping/roadmap'
import { notifyEach } from './notifications'

// Acces base de la page « Prochainement » (regles pures : server/utils/clipping/roadmap.ts).

export type BlockRow = {
  id: string, featureAId: string, featureBId: string, status: string, endsAt: Date, winnerId: string | null, decidedBy: string | null
  featureA: { carriedVotes: number }, featureB: { carriedVotes: number }
}

export async function blockTally(block: BlockRow): Promise<Tally> {
  const votes = await prisma.roadmapVote.findMany({ where: { blockId: block.id }, select: { featureId: true } })
  return tally(votes, block.featureAId, block.featureBId, block.featureA.carriedVotes, block.featureB.carriedVotes)
}

// Cloture un bloc : la gagnante passe « en cours », la perdante revient dans la liste avec ses votes conserves.
export async function finishBlock(block: BlockRow, winnerId: string, decidedBy: 'votes' | 'admin', t: Tally): Promise<void> {
  const loserId = winnerId === block.featureAId ? block.featureBId : block.featureAId
  const loserTotal = loserId === block.featureAId ? t.a : t.b
  await prisma.$transaction([
    prisma.roadmapBlock.update({ where: { id: block.id }, data: { status: 'closed', winnerId, decidedBy, closedAt: new Date() } }),
    prisma.roadmapFeature.update({ where: { id: winnerId }, data: { status: 'building', carriedVotes: 0 } }),
    prisma.roadmapFeature.update({ where: { id: loserId }, data: { status: 'backlog', carriedVotes: loserTotal } })
  ])
  // Cloche : chaque chaine apprend le resultat, avec un texte selon son propre vote.
  const [winner, votes, channels] = await Promise.all([
    prisma.roadmapFeature.findUnique({ where: { id: winnerId }, select: { title: true } }),
    prisma.roadmapVote.findMany({ where: { blockId: block.id }, select: { channelId: true, featureId: true } }),
    prisma.channel.findMany({ select: { id: true } })
  ])
  const voted = new Map(votes.map(v => [v.channelId, v.featureId]))
  await notifyEach(channels.map(c => ({ channelId: c.id, note: resultNote(winner?.title ?? '', !voted.has(c.id) ? 'none' : voted.get(c.id) === winnerId ? 'won' : 'lost') })))
}

// Les blocs dont l'echeance est passee se ferment a la prochaine lecture (pas de tache planifiee). Egalite : l'admin tranche.
export async function closeDueBlocks(now = new Date()): Promise<void> {
  const due = await prisma.roadmapBlock.findMany({
    where: { status: 'open', endsAt: { lte: now } },
    include: { featureA: { select: { carriedVotes: true } }, featureB: { select: { carriedVotes: true } } }
  })
  for (const block of due) {
    if (!isDue(block.endsAt, now)) continue
    const t = await blockTally(block)
    const o = outcome(t)
    if (o === 'tie') await prisma.roadmapBlock.update({ where: { id: block.id }, data: { status: 'needs_admin' } })
    else await finishBlock(block, o === 'a' ? block.featureAId : block.featureBId, 'votes', t)
  }
}
