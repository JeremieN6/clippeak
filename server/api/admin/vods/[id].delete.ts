import { prisma } from '../../../utils/prisma'
import { parseId, requireStudioAdmin } from '../../../utils/studioAuth'

// Retire une VOD ajoutée à la main qui n'a encore produit aucun moment (donc aucun clip) : erreur de lien, VOD en échec.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const id = parseId(getRouterParam(event, 'id'))
  const vod = await prisma.vod.findUnique({ where: { id }, select: { source: true, status: true, _count: { select: { moments: true } } } })
  if (!vod || vod.source !== 'manual') throw createError({ statusCode: 404, statusMessage: 'VOD introuvable' })
  if (vod.status === 'analyzing') throw createError({ statusCode: 409, statusMessage: 'Analyse en cours : attends la fin avant de retirer cette VOD' })
  if (vod._count.moments > 0) throw createError({ statusCode: 409, statusMessage: 'Cette VOD a déjà produit des moments : elle reste pour garder ses clips' })
  await prisma.vod.delete({ where: { id } })
  return { ok: true }
})
