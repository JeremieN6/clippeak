import { prisma } from '../../../utils/prisma'
import { parseId, requireStudioAdmin } from '../../../utils/studioAuth'

// Retire une invitation : la chaine ne peut plus se connecter et ses sessions en cours sont fermees. Ses donnees sont conservees.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const id = parseId(getRouterParam(event, 'id'))
  const invite = await prisma.channelInvite.findUnique({ where: { id } })
  if (!invite) throw createError({ statusCode: 404, statusMessage: 'Invitation introuvable' })
  await prisma.channelInvite.delete({ where: { id } })
  if (invite.twitchId) {
    const channel = await prisma.channel.findUnique({ where: { twitchId: invite.twitchId }, select: { id: true } })
    if (channel) await prisma.studioSession.deleteMany({ where: { channelId: channel.id } })
  }
  return { ok: true }
})
