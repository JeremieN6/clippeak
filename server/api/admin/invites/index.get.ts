import { prisma } from '../../../utils/prisma'
import { requireStudioAdmin } from '../../../utils/studioAuth'

// Liste des chaines invitees (admin seulement, mot de passe dans l'en-tete).
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const invites = await prisma.channelInvite.findMany({ orderBy: { createdAt: 'desc' }, take: 500 })
  return {
    invites: invites.map(i => ({ id: i.id, login: i.twitchLogin, note: i.note, connected: Boolean(i.twitchId), createdAt: i.createdAt, lastLoginAt: i.lastLoginAt }))
  }
})
