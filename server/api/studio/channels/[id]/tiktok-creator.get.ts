import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'
import { tiktokConfig } from '../../../../utils/publishConfig'
import { tiktokAccessFor } from '../../../../utils/tiktokAccess'
import { TiktokApiError, queryCreatorInfo } from '../../../../utils/clipping/tiktokApi'

// Informations du compte TikTok connecte, lues AVANT d'afficher l'ecran de publication (regle de TikTok) : pseudo, visibilites permises,
// interactions desactivees, duree maximale. Lues a chaque ouverture : elles peuvent changer d'une publication a l'autre.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const config = tiktokConfig(event)
  if (!config.configured) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const access = await tiktokAccessFor(event, id)
  if (!access) throw createError({ statusCode: 409, statusMessage: 'Compte TikTok non connecté ou accès expiré : reconnecte-le.' })
  try {
    return await queryCreatorInfo(fetch, access, config.apiBase)
  } catch (error) {
    if (error instanceof TiktokApiError && error.kind === 'auth') throw createError({ statusCode: 409, statusMessage: 'Accès TikTok expiré : reconnecte ton compte.' })
    console.error('[tiktok] informations du compte indisponibles', error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'TikTok ne répond pas pour le moment. Réessaie dans quelques minutes.' })
  }
})
