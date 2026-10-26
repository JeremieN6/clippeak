import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { prisma } from '../../../../utils/prisma'
import { mediaSecret, parseId } from '../../../../utils/studioAuth'
import { parseRange, verifyMediaToken } from '../../../../utils/clipping/adminAuth'
import { dataDir, safeResolve } from '../../../../utils/clipping/dataDir'

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

  const path = safeResolve(dataDir(), asset.path)
  const size = (await stat(path).catch(() => null))?.size
  if (!size) throw createError({ statusCode: 404, statusMessage: 'Fichier introuvable' })

  setHeader(event, 'content-type', contentType)
  setHeader(event, 'accept-ranges', 'bytes')
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'x-content-type-options', 'nosniff')

  const range = parseRange(getHeader(event, 'range'), size)
  if (range === 'invalid') {
    setHeader(event, 'content-range', `bytes */${size}`)
    throw createError({ statusCode: 416, statusMessage: 'Plage invalide' })
  }
  if (!range) {
    setHeader(event, 'content-length', size)
    return sendStream(event, createReadStream(path))
  }
  setResponseStatus(event, 206)
  setHeader(event, 'content-range', `bytes ${range.start}-${range.end}/${size}`)
  setHeader(event, 'content-length', range.end - range.start + 1)
  return sendStream(event, createReadStream(path, { start: range.start, end: range.end }))
})
