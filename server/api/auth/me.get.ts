import { prisma } from '../../utils/prisma'
import { requireStudioActor } from '../../utils/studioAuth'

// Qui est connecte : le streamer (sa chaine) ou l'admin (session de /admin, sans chaine propre).
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  if (actor.admin) return { role: 'admin' as const, channel: null }
  if (!actor.channelId) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })
  const channel = await prisma.channel.findUnique({ where: { id: actor.channelId }, select: { id: true, login: true, displayName: true, autoClip: true } })
  if (!channel) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })
  return { role: 'streamer' as const, channel: { ...channel, demo: false } }
})
