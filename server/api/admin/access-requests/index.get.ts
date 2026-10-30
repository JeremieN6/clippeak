import { prisma } from '../../../utils/prisma'
import { requireStudioAdmin } from '../../../utils/studioAuth'

const KEEP_DAYS = 90

// Demandes d'acces des streamers non invites (admin). Les demandes de plus de 90 jours sont effacees a la lecture.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  await prisma.accessRequest.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 24 * 3600 * 1000) } } })
  const requests = await prisma.accessRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
  const invited = new Set((await prisma.channelInvite.findMany({ where: { twitchLogin: { in: requests.map(r => r.twitchLogin) } }, select: { twitchLogin: true } })).map(i => i.twitchLogin))
  return { requests: requests.filter(r => !invited.has(r.twitchLogin)).map(r => ({ id: r.id, login: r.twitchLogin, displayName: r.displayName, createdAt: r.createdAt })) }
})
