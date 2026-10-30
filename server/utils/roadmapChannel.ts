import { prisma } from './prisma'
import { parseId, type StudioActor } from './studioAuth'

// Chaine qui vote / propose une idee : le streamer connecte (la sienne), ou l'admin sur une chaine qu'il indique (essais).
export async function voterChannel(actor: StudioActor, bodyChannel: unknown): Promise<string> {
  if (!actor.admin) return actor.channelId as string
  const id = parseId(bodyChannel)
  if (!await prisma.channel.findUnique({ where: { id }, select: { id: true } })) throw createError({ statusCode: 404, statusMessage: 'Chaine introuvable' })
  return id
}
