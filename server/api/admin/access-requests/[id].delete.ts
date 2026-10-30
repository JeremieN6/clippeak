import { prisma } from '../../../utils/prisma'
import { parseId, requireStudioAdmin } from '../../../utils/studioAuth'

// Ecarte une demande d'acces (efface le pseudo enregistre).
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const { count } = await prisma.accessRequest.deleteMany({ where: { id: parseId(getRouterParam(event, 'id')) } })
  if (!count) throw createError({ statusCode: 404, statusMessage: 'Demande introuvable' })
  return { ok: true }
})
