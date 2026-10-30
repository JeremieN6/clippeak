import { prisma } from '../../../../utils/prisma'
import { parseId, requireStudioAdmin } from '../../../../utils/studioAuth'
import { isQuotaExempt, parseQuotaInput } from '../../../../utils/clipping/quota'

// Regle le plafond mensuel de clips d'une chaine : un entier de 0 a 1000, ou null pour le retirer (illimite). Admin seulement.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const id = parseId(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const parsed = parseQuotaInput(body?.limit)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: 'Plafond invalide : un nombre entier de 0 à 1000, ou vide pour illimité.' })
  const channel = await prisma.channel.findUnique({ where: { id }, select: { twitchId: true } })
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Chaîne introuvable' })
  if (isQuotaExempt(channel.twitchId)) throw createError({ statusCode: 409, statusMessage: 'Les chaînes de démonstration et de test ne sont jamais plafonnées.' })
  await prisma.streamerSettings.upsert({ where: { channelId: id }, update: { monthlyClipQuota: parsed.value }, create: { channelId: id, monthlyClipQuota: parsed.value } })
  return { ok: true, limit: parsed.value }
})
