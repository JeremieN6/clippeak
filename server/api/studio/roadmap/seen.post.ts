import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { requireStudioActor } from '../../../utils/studioAuth'
import { voterChannel } from '../../../utils/roadmapChannel'

const schema = z.object({ blockId: z.string().uuid(), channelId: z.string().optional() })

// Le streamer a vu le resultat d'un vote : le bandeau disparait.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Requête invalide' })
  const channelId = await voterChannel(actor, parsed.data.channelId)
  await prisma.roadmapVote.updateMany({ where: { blockId: parsed.data.blockId, channelId }, data: { resultSeen: true } })
  return { ok: true }
})
