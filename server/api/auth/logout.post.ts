import { prisma } from '../../utils/prisma'
import { hashToken, SESSION_COOKIE } from '../../utils/clipping/twitchLogin'

// Deconnexion : la session est supprimee en base et le cookie efface.
export default defineEventHandler(async (event) => {
  const token = getCookie(event, SESSION_COOKIE)
  if (token) await prisma.studioSession.deleteMany({ where: { tokenHash: hashToken(token) } })
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
  return { ok: true }
})
