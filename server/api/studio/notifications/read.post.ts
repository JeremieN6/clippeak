import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { requireStudioActor } from '../../../utils/studioAuth'
import { voterChannel } from '../../../utils/roadmapChannel'

const schema = z.object({ channelId: z.string().optional() })

// Marque toutes les notifications de la chaine comme lues (a l'ouverture de la cloche).
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Requête invalide' })
  const channelId = await voterChannel(actor, parsed.data.channelId)
  await prisma.notification.updateMany({ where: { channelId, readAt: null }, data: { readAt: new Date() } })
  return { ok: true }
})
