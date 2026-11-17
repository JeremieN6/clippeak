import { extname } from 'node:path'
import { prisma } from '../../../../utils/prisma'
import { mediaSecret, parseId } from '../../../../utils/studioAuth'
import { verifyMediaToken } from '../../../../utils/clipping/adminAuth'
import { dataDir, safeResolve } from '../../../../utils/clipping/dataDir'
import { sendFileWithRange } from '../../../../utils/sendFileWithRange'

// Types servis pour l'apercu (les polices ne sont pas previsualisees). Tout autre type est refuse.
const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4'
}

// Apercu d'un fichier du streamer (image, video, son) avec jeton signe a duree limitee et lecture progressive (Range).
export default defineEventHandler(async (event) => {
  const id = parseId(getRouterParam(event, 'id'))
  const token = String(getQuery(event).t ?? '')
  if (!verifyMediaToken(mediaSecret(event), `asset:${id}`, token)) throw createError({ statusCode: 403, statusMessage: 'Lien expire ou invalide' })

  const asset = await prisma.streamerAsset.findUnique({ where: { id }, select: { path: true, filename: true } })
  const contentType = asset ? CONTENT_TYPES[extname(asset.filename).toLowerCase()] : undefined
  if (!asset || !contentType) throw createError({ statusCode: 404, statusMessage: 'Fichier indisponible' })
  return sendFileWithRange(event, safeResolve(dataDir(), asset.path), contentType)
})
