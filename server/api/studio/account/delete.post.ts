import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { requireStudioActor } from '../../../utils/studioAuth'
import { deleteChannelAccount } from '../../../utils/accountData'
import { SESSION_COOKIE } from '../../../utils/clipping/twitchLogin'

const schema = z.object({ confirm: z.string().trim().min(1).max(60) })

// « Supprimer mon compte et toutes mes donnees ». Reserve au streamer lui-meme (pas a l'admin) et soumis a une confirmation :
// il doit retaper le nom de sa chaine. Irreversible.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  if (actor.admin || !actor.channelId) throw createError({ statusCode: 403, statusMessage: 'Seul le propriétaire du compte peut le supprimer.' })
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Retape le nom de ta chaîne pour confirmer.' })
  const channel = await prisma.channel.findUnique({ where: { id: actor.channelId }, select: { login: true } })
  if (!channel || parsed.data.confirm.toLowerCase() !== channel.login.toLowerCase()) throw createError({ statusCode: 400, statusMessage: 'Le nom saisi ne correspond pas à ta chaîne.' })
  const result = await deleteChannelAccount(actor.channelId)
  if (!result.ok) throw createError({ statusCode: result.reason === 'protected' ? 403 : 404, statusMessage: 'Ce compte ne peut pas être supprimé ici.' })
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
  return { ok: true, steps: result.steps }
})
