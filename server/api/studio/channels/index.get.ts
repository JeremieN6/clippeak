import { prisma } from '../../../utils/prisma'
import { requireStudioActor } from '../../../utils/studioAuth'

export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const channels = await prisma.channel.findMany({ where: actor.admin ? {} : { id: actor.channelId ?? '' }, orderBy: { createdAt: 'asc' }, select: { id: true, login: true, displayName: true, autoClip: true } })
  return { channels }
})
