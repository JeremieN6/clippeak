import { z } from 'zod'
import { prisma } from '../../../../../utils/prisma'
import { parseId, requireStudioAdmin } from '../../../../../utils/studioAuth'
import { blockTally, finishBlock } from '../../../../../utils/roadmapStore'
import { outcome } from '../../../../../utils/clipping/roadmap'

const schema = z.object({ featureId: z.string().uuid().optional() })

// Cloture un bloc maintenant. Avec `featureId` : l'admin tranche (egalite, zero vote, ou decision). Sans : la plus votee gagne ;
// en cas d'egalite il faut trancher.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const id = parseId(getRouterParam(event, 'id'))
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Requête invalide' })
  const block = await prisma.roadmapBlock.findUnique({ where: { id }, include: { featureA: { select: { carriedVotes: true } }, featureB: { select: { carriedVotes: true } } } })
  if (!block) throw createError({ statusCode: 404, statusMessage: 'Bloc introuvable' })
  if (block.status === 'closed') throw createError({ statusCode: 409, statusMessage: 'Ce bloc est déjà clos.' })
  const t = await blockTally(block)
  if (parsed.data.featureId) {
    if (![block.featureAId, block.featureBId].includes(parsed.data.featureId)) throw createError({ statusCode: 400, statusMessage: 'Cette fonction n’est pas dans ce bloc.' })
    await finishBlock(block, parsed.data.featureId, 'admin', t)
    return { ok: true, decidedBy: 'admin' }
  }
  const o = outcome(t)
  if (o === 'tie') throw createError({ statusCode: 409, statusMessage: 'Égalité : choisis la fonction à développer en priorité.' })
  await finishBlock(block, o === 'a' ? block.featureAId : block.featureBId, 'votes', t)
  return { ok: true, decidedBy: 'votes' }
})
