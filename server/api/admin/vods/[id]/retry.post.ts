import { prisma } from '../../../../utils/prisma'
import { parseId, requireStudioAdmin } from '../../../../utils/studioAuth'

// Relance l'analyse d'une VOD ajoutée à la main qui a échoué (le worker la reprend au prochain passage).
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const id = parseId(getRouterParam(event, 'id'))
  const result = await prisma.vod.updateMany({ where: { id, source: 'manual', status: 'failed' }, data: { status: 'ended' } })
  if (!result.count) throw createError({ statusCode: 409, statusMessage: 'Seule une VOD ajoutée à la main et en échec peut être relancée' })
  return { ok: true }
})
