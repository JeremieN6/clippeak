import { z } from 'zod'
import { prisma } from '../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor, uuidSchema } from '../../../../utils/studioAuth'
import { LONG_DEFAULT_MAX_SEC, clampLongMax, formatClock, validateLongRange } from '../../../../utils/clipping/longExtract'

const bodySchema = z.object({
  vodId: uuidSchema,
  startSec: z.number().min(0).max(24 * 3600),
  endSec: z.number().min(0).max(24 * 3600),
  title: z.string().trim().max(100).optional()
})

// Demande un extrait long : un passage choisi par le streamer dans un de ses lives. Cree un « moment » manuel et un rendu en file ;
// l'extrait revient ensuite dans « A valider » comme un clip. Rien n'est publie : c'est une action separee du streamer.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Choisis un live, un début et une fin.' })
  const { vodId, startSec, endSec } = parsed.data

  const settings = await prisma.streamerSettings.findUnique({ where: { channelId: id }, select: { longExtracts: true, longExtractMaxSec: true, longExtractVerified: true } })
  if (!settings?.longExtracts) throw createError({ statusCode: 409, statusMessage: 'Active d’abord les extraits longs dans les réglages.' })
  const vod = await prisma.vod.findFirst({ where: { id: vodId, channelId: id }, select: { id: true, title: true, status: true, startedAt: true, endedAt: true } })
  if (!vod) throw createError({ statusCode: 404, statusMessage: 'Live introuvable' })
  if (!['ended', 'analyzing', 'done'].includes(vod.status)) throw createError({ statusCode: 409, statusMessage: 'Ce live n’est pas encore (ou plus) lisible par Clippeak.' })

  const duration = vod.startedAt && vod.endedAt ? (vod.endedAt.getTime() - vod.startedAt.getTime()) / 1000 : null
  const problem = validateLongRange({ startSec, endSec, maxSec: clampLongMax(settings.longExtractMaxSec ?? LONG_DEFAULT_MAX_SEC, settings.longExtractVerified), vodDurationSec: duration })
  if (problem) throw createError({ statusCode: 400, statusMessage: problem })

  const title = parsed.data.title || (vod.title ? `${vod.title} (${formatClock(startSec)})` : `Extrait de live (${formatClock(startSec)})`)
  const moment = await prisma.moment.create({
    data: {
      vodId: vod.id, startSec, endSec, peakSec: startSec, score: 0, signals: {}, status: 'validated',
      kind: 'long', rationale: 'Extrait long choisi par le streamer', scorer: 'manual'
    }
  })
  const job = await prisma.clipJob.create({
    data: {
      momentId: moment.id, format: 'long', status: 'queued', title: title.slice(0, 100), startSec, endSec,
      keepRanges: [{ start: startSec, end: endSec }] as any,
      caption: `Extrait du live « ${vod.title ?? 'sans titre'} », de ${formatClock(startSec)} à ${formatClock(endSec)}.`
    }
  })
  return { id: job.id, status: job.status }
})
