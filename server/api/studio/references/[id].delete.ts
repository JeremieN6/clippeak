import { unlink } from 'node:fs/promises'
import { prisma } from '../../../utils/prisma'
import { parseId, requireStudioAdmin } from '../../../utils/studioAuth'
import { dataDir, safeResolve } from '../../../utils/clipping/dataDir'

// Supprime un element de la banque (et le fichier depose, ainsi que les clips issus d'un compte).
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const id = parseId(getRouterParam(event, 'id'))
  const item = await prisma.referenceItem.findUnique({ where: { id } })
  if (!item) throw createError({ statusCode: 404, statusMessage: 'Element introuvable' })
  const children = await prisma.referenceItem.findMany({ where: { parentId: id }, select: { filePath: true } })
  await prisma.referenceItem.deleteMany({ where: { OR: [{ id }, { parentId: id }] } })
  for (const path of [item.filePath, ...children.map(c => c.filePath)]) {
    if (path) await unlink(safeResolve(dataDir(), path)).catch(() => {})
  }
  return { ok: true }
})
