import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'
import { prisma } from '../../../../utils/prisma'
import { instagramAccessFor } from '../../../../utils/instagramAccess'
import { InstagramApiError, fetchInstagramAccounts } from '../../../../utils/clipping/instagramApi'

// Comptes Instagram que Meta a assignes a Clippeak pour cette chaine, et celui qui recevra les Reels. Lus a chaque ouverture (Meta peut en avoir
// ajoute ou retire). Les jetons ne sortent jamais du serveur.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const access = await instagramAccessFor(event, id)
  if (!access) throw createError({ statusCode: 409, statusMessage: 'Compte Instagram non connecté ou accès expiré : reconnecte-le.' })
  const connection = await prisma.platformConnection.findUnique({ where: { id: access.connectionId }, select: { externalId: true } })
  try {
    const accounts = await fetchInstagramAccounts(fetch, access.token, access.graphBase)
    return { accounts: accounts.map(a => ({ id: a.userId, username: a.username })), selectedId: connection?.externalId ?? null }
  } catch (error) {
    if (error instanceof InstagramApiError && error.kind === 'auth') throw createError({ statusCode: 409, statusMessage: 'Accès Instagram expiré : reconnecte ton compte.' })
    console.error('[instagram] liste des comptes indisponible', error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'Instagram ne répond pas pour le moment. Réessaie dans quelques minutes.' })
  }
})
