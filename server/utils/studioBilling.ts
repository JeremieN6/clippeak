import type { H3Event } from 'h3'
import { prisma } from './prisma'
import { requireStudioActor } from './studioAuth'
import { isQuotaExempt } from './clipping/quota'

// Facturation : reservee au streamer connecte, pour SA chaine. L'admin n'ouvre jamais un paiement a la place d'un streamer, et les
// chaines de demonstration et de test ne s'abonnent pas.
export async function requireBillingChannel(event: H3Event): Promise<string> {
  const actor = await requireStudioActor(event)
  if (actor.admin || !actor.channelId) throw createError({ statusCode: 403, statusMessage: 'Le paiement se fait depuis le compte du streamer.' })
  const channel = await prisma.channel.findUnique({ where: { id: actor.channelId }, select: { id: true, twitchId: true } })
  if (!channel || isQuotaExempt(channel.twitchId)) throw createError({ statusCode: 403, statusMessage: 'Cette chaîne ne peut pas s’abonner.' })
  return channel.id
}
