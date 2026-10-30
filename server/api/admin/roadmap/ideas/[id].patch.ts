import { z } from 'zod'
import { prisma } from '../../../../utils/prisma'
import { parseId, requireStudioAdmin } from '../../../../utils/studioAuth'

const schema = z.object({ status: z.enum(['new', 'archived']) })

// Range une idee (lue) ou la remet a traiter.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const id = parseId(getRouterParam(event, 'id'))
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Statut invalide' })
  const r = await prisma.roadmapIdea.updateMany({ where: { id }, data: { status: parsed.data.status } })
  if (!r.count) throw createError({ statusCode: 404, statusMessage: 'Idée introuvable' })
  return { ok: true }
})
