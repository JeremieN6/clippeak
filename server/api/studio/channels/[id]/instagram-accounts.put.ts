import { z } from 'zod'
import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'
import { prisma } from '../../../../utils/prisma'
import { instagramAccessFor } from '../../../../utils/instagramAccess'
import { InstagramApiError, fetchInstagramAccounts } from '../../../../utils/clipping/instagramApi'

// Choix du compte Instagram qui recevra les Reels. Le compte doit faire partie de la liste donnee par Meta MAINTENANT (jamais un identifiant
// envoye tel quel par le navigateur).
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const body = z.object({ accountId: z.string().min(1).max(40) }).safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Compte invalide' })
  const access = await instagramAccessFor(event, id)
  if (!access) throw createError({ statusCode: 409, statusMessage: 'Compte Instagram non connecté ou accès expiré : reconnecte-le.' })
  let accounts
  try {
    accounts = await fetchInstagramAccounts(fetch, access.token, access.graphBase)
  } catch (error) {
    if (error instanceof InstagramApiError && error.kind === 'auth') throw createError({ statusCode: 409, statusMessage: 'Accès Instagram expiré : reconnecte ton compte.' })
    throw createError({ statusCode: 503, statusMessage: 'Instagram ne répond pas pour le moment. Réessaie dans quelques minutes.' })
  }
  const chosen = accounts.find(a => a.userId === body.data.accountId)
  if (!chosen) throw createError({ statusCode: 400, statusMessage: 'Ce compte n’est pas partagé avec Clippeak.' })
  await prisma.platformConnection.update({ where: { id: access.connectionId }, data: { externalId: chosen.userId.slice(0, 40), accountName: chosen.username || null } })
  return { ok: true, selectedId: chosen.userId, accountName: chosen.username }
})
