import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { H3Event } from 'h3'
import { prisma } from './prisma'
import { parseRange } from './clipping/adminAuth'
import { dataDir, safeResolve } from './clipping/dataDir'

// Envoie la video d'un clip (lecture progressive avec Range). L'appelant a DEJA verifie le jeton signe.
export async function serveClipFile(event: H3Event, id: string) {
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
    if (event.method === 'HEAD') return ''
    return sendStream(event, createReadStream(path))
  }
  setResponseStatus(event, 206)
  setHeader(event, 'content-range', `bytes ${range.start}-${range.end}/${size}`)
  setHeader(event, 'content-length', range.end - range.start + 1)
  if (event.method === 'HEAD') return ''
  return sendStream(event, createReadStream(path, { start: range.start, end: range.end }))
}
