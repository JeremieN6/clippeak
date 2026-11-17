import type { H3Event } from 'h3'
import { prisma } from './prisma'
import { dataDir, safeResolve } from './clipping/dataDir'
import { sendFileWithRange } from './sendFileWithRange'

// Envoie la video d'un clip (lecture progressive avec Range). L'appelant a DEJA verifie le jeton signe.
export async function serveClipFile(event: H3Event, id: string) {
  const job = await prisma.clipJob.findUnique({ where: { id }, select: { outputPath: true } })
  if (!job?.outputPath) throw createError({ statusCode: 404, statusMessage: 'Clip indisponible' })
  return sendFileWithRange(event, safeResolve(dataDir(), job.outputPath), 'video/mp4')
}
