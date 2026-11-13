import { z } from 'zod'
import { prisma } from '../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'
import { LONG_ABSOLUTE_MAX_SEC, LONG_MIN_SEC } from '../../../../utils/clipping/longExtract'

const bodySchema = z.object({ enabled: z.boolean(), maxSec: z.number().int().min(LONG_MIN_SEC).max(LONG_ABSOLUTE_MAX_SEC) })

// Active ou coupe les extraits longs YouTube de la chaine, et fixe leur duree maximale.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Durée maximale invalide (de 30 secondes à 15 minutes).' })
  const channel = await prisma.channel.findUnique({ where: { id }, select: { id: true } })
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Streamer introuvable' })
  const data = { longExtracts: parsed.data.enabled, longExtractMaxSec: parsed.data.maxSec }
  await prisma.streamerSettings.upsert({ where: { channelId: id }, update: data, create: { channelId: id, ...data } })
  return { ok: true }
})
