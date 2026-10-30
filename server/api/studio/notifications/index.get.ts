import { prisma } from '../../../utils/prisma'
import { parseId, requireStudioActor } from '../../../utils/studioAuth'

// Cloche du studio : les 20 dernieres notifications de la chaine et le nombre de non lues. L'admin consulte avec ?channel=<id>.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const q = getQuery(event).channel
  const channelId = actor.admin ? (typeof q === 'string' && q ? parseId(q) : null) : actor.channelId
  if (!channelId) return { items: [], unread: 0 }
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({ where: { channelId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.notification.count({ where: { channelId, readAt: null } })
  ])
  return { items: rows.map(n => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, createdAt: n.createdAt, read: Boolean(n.readAt) })), unread }
})
