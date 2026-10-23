import { prisma } from '../../../utils/prisma'
import { requireStudioAdmin } from '../../../utils/studioAuth'

export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const channels = await prisma.channel.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, login: true, displayName: true, autoClip: true } })
  return { channels }
})
