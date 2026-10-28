import { z } from 'zod'
import { prisma } from '../../../../utils/prisma'
import { parseId, assertChannel, requireStudioActor } from '../../../../utils/studioAuth'

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur au format #RRGGBB')

const settingsSchema = z.object({
  keywords: z.array(z.string().trim().min(1).max(40)).min(1).max(60),
  clipMinSec: z.number().int().min(15).max(120),
  clipMaxSec: z.number().int().min(15).max(180),
  subtitles: z.boolean(),
  accentColor: hex,
  highlightColor: hex
}).refine(s => s.clipMaxSec >= s.clipMinSec, { message: 'La duree maximale doit etre superieure a la duree minimale', path: ['clipMaxSec'] })

export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const parsed = settingsSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Reglages invalides' })
  const data = { ...parsed.data, keywords: [...new Set(parsed.data.keywords.map(k => k.toLowerCase()))] }

  const channel = await prisma.channel.findUnique({ where: { id }, select: { id: true } })
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Streamer introuvable' })
  await prisma.streamerSettings.upsert({ where: { channelId: id }, update: data, create: { channelId: id, ...data } })
  return { ok: true }
})
