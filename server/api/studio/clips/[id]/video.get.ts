import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { prisma } from '../../../../utils/prisma'
import { mediaSecret, parseId } from '../../../../utils/studioAuth'
import { parseRange, verifyMediaToken } from '../../../../utils/clipping/adminAuth'
import { dataDir, safeResolve } from '../../../../utils/clipping/dataDir'

// Lecture d'un clip dans le navigateur (balise <video>) avec jeton signe et lecture progressive (Range).
export default defineEventHandler(async (event) => {
  const id = parseId(getRouterParam(event, 'id'))
  const token = String(getQuery(event).t ?? '')
  if (!verifyMediaToken(mediaSecret(event), `clip:${id}`, token)) throw createError({ statusCode: 403, statusMessage: 'Lien expire ou invalide' })

  const job = await prisma.clipJob.findUnique({ where: { id }, select: { outputPath: true } })
  if (!job?.outputPath) throw createError({ statusCode: 404, statusMessage: 'Clip indisponible' })

  const path = safeResolve(dataDir(), job.outputPath)
  const size = (await stat(path).catch(() => null))?.size
  if (!size) throw createError({ statusCode: 404, statusMessage: 'Fichier introuvable' })

  setHeader(event, 'content-type', 'video/mp4')
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
