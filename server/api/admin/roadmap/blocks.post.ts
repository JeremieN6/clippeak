import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { requireStudioAdmin } from '../../../utils/studioAuth'
import { closeDueBlocks } from '../../../utils/roadmapStore'

const schema = z.object({ featureAId: z.string().uuid(), featureBId: z.string().uuid(), days: z.number().int().min(1).max(60).default(14) })

// Lance un bloc de vote entre deux fonctions de la liste (un seul bloc a la fois). Echeance : 14 jours par defaut.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success || parsed.data.featureAId === parsed.data.featureBId) throw createError({ statusCode: 400, statusMessage: 'Choisis deux fonctions différentes.' })
  await closeDueBlocks()
  if (await prisma.roadmapBlock.findFirst({ where: { status: { in: ['open', 'needs_admin'] } }, select: { id: true } })) {
    throw createError({ statusCode: 409, statusMessage: 'Un vote est déjà en cours : clôture-le avant d’en lancer un autre.' })
  }
  const features = await prisma.roadmapFeature.findMany({ where: { id: { in: [parsed.data.featureAId, parsed.data.featureBId] }, status: 'backlog' }, select: { id: true } })
  if (features.length !== 2) throw createError({ statusCode: 409, statusMessage: 'Les deux fonctions doivent être « dans la liste ».' })
  const block = await prisma.$transaction(async (tx) => {
    await tx.roadmapFeature.updateMany({ where: { id: { in: features.map(f => f.id) } }, data: { status: 'voting' } })
    return tx.roadmapBlock.create({ data: { featureAId: parsed.data.featureAId, featureBId: parsed.data.featureBId, endsAt: new Date(Date.now() + parsed.data.days * 24 * 3600 * 1000) } })
  })
  return { id: block.id }
})
