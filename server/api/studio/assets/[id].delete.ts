import { unlink } from 'node:fs/promises'
import { prisma } from '../../../utils/prisma'
import { parseId, requireStudioAdmin } from '../../../utils/studioAuth'
import { dataDir, safeResolve } from '../../../utils/clipping/dataDir'

export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const id = parseId(getRouterParam(event, 'id'))
  const asset = await prisma.streamerAsset.findUnique({ where: { id } })
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'Fichier introuvable' })
  await prisma.streamerAsset.delete({ where: { id } })
  await unlink(safeResolve(dataDir(), asset.path)).catch(() => {})
  return { ok: true }
})
