import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { H3Event } from 'h3'
import { parseRange } from './clipping/adminAuth'

// Envoie un fichier local avec lecture progressive (en-tete Range : 206, ou 416 si la plage est invalide) et sans mise en cache. Une seule
// version pour les videos des clips et les fichiers du streamer. L'appelant a DEJA verifie le jeton signe et resolu le chemin en toute securite.
export async function sendFileWithRange(event: H3Event, path: string, contentType: string) {
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
    if (event.method === 'HEAD') return ''
    return sendStream(event, createReadStream(path))
  }
  setResponseStatus(event, 206)
  setHeader(event, 'content-range', `bytes ${range.start}-${range.end}/${size}`)
  setHeader(event, 'content-length', range.end - range.start + 1)
  if (event.method === 'HEAD') return ''
  return sendStream(event, createReadStream(path, { start: range.start, end: range.end }))
}
