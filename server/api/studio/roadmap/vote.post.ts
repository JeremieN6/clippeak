import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { requireStudioActor } from '../../../utils/studioAuth'
import { voterChannel } from '../../../utils/roadmapChannel'
import { closeDueBlocks } from '../../../utils/roadmapStore'

const schema = z.object({ blockId: z.string().uuid(), featureId: z.string().uuid(), channelId: z.string().optional() })

// Vote (ou changement de vote) pour l'une des deux fonctions du bloc ouvert, jusqu'a l'echeance. Un vote par chaine et par bloc.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Vote invalide' })
  const channelId = await voterChannel(actor, parsed.data.channelId)
  await closeDueBlocks()
  const block = await prisma.roadmapBlock.findUnique({ where: { id: parsed.data.blockId } })
  if (!block || block.status !== 'open' || block.endsAt.getTime() <= Date.now()) throw createError({ statusCode: 409, statusMessage: 'Ce vote est terminé.' })
  if (![block.featureAId, block.featureBId].includes(parsed.data.featureId)) throw createError({ statusCode: 400, statusMessage: 'Cette fonction n’est pas dans ce vote.' })
  await prisma.roadmapVote.upsert({
    where: { blockId_channelId: { blockId: block.id, channelId } },
    update: { featureId: parsed.data.featureId },
    create: { blockId: block.id, channelId, featureId: parsed.data.featureId }
  })
  return { ok: true }
})
