import { z } from 'zod'
import { prisma } from '../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'
import { LONG_ABSOLUTE_MAX_SEC, LONG_MIN_SEC, LONG_UNVERIFIED_MAX_SEC } from '../../../../utils/clipping/longExtract'
import { DEFAULT_END_COMMAND, DEFAULT_START_COMMAND, commandsProblem, normalizeCommand } from '../../../../utils/clipping/longMarkers'
import { LONG_LOCKED_MESSAGE } from '../../../../utils/clipping/longAccess'
import { longSettings } from '../../../../utils/longProposals'

const bodySchema = z.object({ enabled: z.boolean(), maxSec: z.number().int().min(LONG_MIN_SEC).max(LONG_ABSOLUTE_MAX_SEC), verified: z.boolean().optional(), startCommand: z.string().max(40).optional(), endCommand: z.string().max(40).optional(), modsAllowed: z.boolean().optional() })

// Active ou coupe les extraits longs YouTube de la chaine, et fixe leur duree maximale.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Durée maximale invalide (de 3 minutes à 60 minutes).' })
  const verified = parsed.data.verified ?? false
  if (!verified && parsed.data.maxSec > LONG_UNVERIFIED_MAX_SEC) throw createError({ statusCode: 400, statusMessage: 'Au-delà de 15 minutes, confirme que ta chaîne YouTube est vérifiée.' })
  // Commandes du chat : absentes = les valeurs par defaut ; sinon controlees et rangees en minuscules.
  const startCommand = parsed.data.startCommand ?? DEFAULT_START_COMMAND
  const endCommand = parsed.data.endCommand ?? DEFAULT_END_COMMAND
  const commands = commandsProblem(startCommand, endCommand)
  if (commands) throw createError({ statusCode: 400, statusMessage: commands })
  const channel = await prisma.channel.findUnique({ where: { id }, select: { id: true } })
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Streamer introuvable' })
  // Reserve a l'offre Creator : activer est refuse sur le plan gratuit (couper reste toujours possible).
  if (parsed.data.enabled && !(await longSettings(id)).allowed) throw createError({ statusCode: 403, statusMessage: LONG_LOCKED_MESSAGE })
  const data = { longExtracts: parsed.data.enabled, longExtractMaxSec: parsed.data.maxSec, longExtractVerified: verified, longStartCommand: normalizeCommand(startCommand)!, longEndCommand: normalizeCommand(endCommand)!, longModsAllowed: parsed.data.modsAllowed ?? false }
  await prisma.streamerSettings.upsert({ where: { channelId: id }, update: data, create: { channelId: id, ...data } })
  return { ok: true }
})
