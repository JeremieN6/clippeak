import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { parseId, assertChannel, requireStudioActor } from '../../../utils/studioAuth'

const count = z.number().min(0).max(10_000_000_000).nullable()

// Statistiques facultatives d'un clip (vues, likes...) : saisies a la main, jamais obligatoires. null = effacer.
const schema = z.object({ viewCount: count, likeCount: count, commentCount: count, shareCount: count }).partial()

export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Statistiques invalides' })
  const existing = await prisma.referenceItem.findUnique({ where: { id }, select: { id: true, kind: true, channelId: true } })
  if (!existing || existing.kind !== 'clip') throw createError({ statusCode: 404, statusMessage: 'Clip introuvable' })
  assertChannel(actor, existing.channelId)
  await prisma.referenceItem.update({ where: { id }, data: parsed.data })
  return { ok: true }
})
