import { prisma } from '../../../../utils/prisma'
import { parseId, requireStudioAdmin } from '../../../../utils/studioAuth'

// Invite en un clic le streamer qui avait demande l'acces : la demande devient une invitation (il n'a plus qu'a se reconnecter).
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const id = parseId(getRouterParam(event, 'id'))
  const request = await prisma.accessRequest.findUnique({ where: { id } })
  if (!request) throw createError({ statusCode: 404, statusMessage: 'Demande introuvable' })
  await prisma.$transaction([
    prisma.channelInvite.upsert({ where: { twitchLogin: request.twitchLogin }, update: {}, create: { twitchLogin: request.twitchLogin, note: 'Demande d\u2019accès' } }),
    prisma.accessRequest.delete({ where: { id } })
  ])
  return { ok: true, login: request.twitchLogin }
})
