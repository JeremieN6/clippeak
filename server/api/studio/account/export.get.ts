import { parseId, requireStudioActor } from '../../../utils/studioAuth'
import { exportChannelData } from '../../../utils/accountData'
import { prisma } from '../../../utils/prisma'

// Export des donnees du streamer (JSON, sans jeton). Le streamer exporte sa chaine ; l'admin peut le faire avec ?channel=<id>
// (par exemple pour repondre a une demande). Telechargement direct.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const q = getQuery(event).channel
  const channelId = actor.admin ? (typeof q === 'string' && q ? parseId(q) : null) : actor.channelId
  if (!channelId) throw createError({ statusCode: 400, statusMessage: 'Chaîne à préciser.' })
  const data = await exportChannelData(channelId)
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Streamer introuvable' })
  const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { login: true } })
  setHeader(event, 'content-type', 'application/json; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="clippeak-donnees-${(channel?.login ?? 'chaine').replace(/[^a-z0-9_-]/gi, '')}.json"`)
  setHeader(event, 'cache-control', 'no-store')
  return JSON.stringify(data, null, 2)
})
