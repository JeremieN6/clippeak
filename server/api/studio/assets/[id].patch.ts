import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { parseId, assertChannel, requireStudioActor } from '../../../utils/studioAuth'

// Mots declencheurs et credit d'une illustration : modifiables apres le depot.
const schema = z.object({
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20),
  source: z.string().trim().max(500).nullable()
})

export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Mots declencheurs ou credit invalides' })
  const asset = await prisma.streamerAsset.findUnique({ where: { id }, select: { kind: true, channelId: true } })
  if (!asset || asset.kind !== 'illustration') throw createError({ statusCode: 404, statusMessage: 'Illustration introuvable' })
  assertChannel(actor, asset.channelId)
  await prisma.streamerAsset.update({ where: { id }, data: { tags: [...new Set(parsed.data.tags)], source: parsed.data.source || null } })
  return { ok: true }
})
