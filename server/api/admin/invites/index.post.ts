import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { requireStudioAdmin } from '../../../utils/studioAuth'
import { normalizeLogin } from '../../../utils/clipping/twitchLogin'

const schema = z.object({ login: z.string(), note: z.string().trim().max(200).optional() })

// Invite une chaine Twitch : elle pourra se connecter avec Twitch. Pseudo deja invite = ignore (idempotent).
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const parsed = schema.safeParse(await readBody(event))
  const login = normalizeLogin(parsed.success ? parsed.data.login : null)
  if (!parsed.success || !login) throw createError({ statusCode: 400, statusMessage: 'Pseudo Twitch invalide (3 a 25 caracteres : lettres, chiffres, _)' })
  const invite = await prisma.channelInvite.upsert({
    where: { twitchLogin: login },
    update: parsed.data.note !== undefined ? { note: parsed.data.note || null } : {},
    create: { twitchLogin: login, note: parsed.data.note || null }
  })
  return { id: invite.id, login: invite.twitchLogin }
})
