import { z } from 'zod'
import { prisma } from '../../../../utils/prisma'
import { parseId, requireStudioAdmin } from '../../../../utils/studioAuth'

// « voting » est reserve aux blocs de vote : on ne le pose pas a la main.
const schema = z.object({
  title: z.string().trim().min(3).max(80).optional(),
  description: z.string().trim().min(5).max(400).optional(),
  status: z.enum(['backlog', 'building', 'waiting_access', 'delivered']).optional()
})

// Modifie une fonction : texte, ou statut (en cours, en attente d'acces, livre, dans la liste).
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const id = parseId(getRouterParam(event, 'id'))
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Modification invalide' })
  const current = await prisma.roadmapFeature.findUnique({ where: { id }, select: { status: true } })
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Fonction introuvable' })
  if (current.status === 'voting' && parsed.data.status) throw createError({ statusCode: 409, statusMessage: 'Cette fonction est en vote : clôture d’abord le bloc.' })
  await prisma.roadmapFeature.update({
    where: { id },
    data: { ...parsed.data, ...(parsed.data.status === 'delivered' ? { deliveredAt: new Date() } : {}) }
  })
  return { ok: true }
})
