import { prisma } from '../../utils/prisma'
import { requireStudioActor } from '../../utils/studioAuth'

// Qui est connecte : la chaine du streamer (cookie de session). L'admin passe par le mot de passe, pas par ici.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  if (actor.admin || !actor.channelId) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })
  const channel = await prisma.channel.findUnique({ where: { id: actor.channelId }, select: { id: true, login: true, displayName: true, autoClip: true } })
  if (!channel) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })
  return { channel }
})
