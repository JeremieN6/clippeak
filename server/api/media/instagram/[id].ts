import { parseId } from '../../../utils/studioAuth'
import { tokenKey } from '../../../utils/publishConfig'
import { verifyInstagramVideoToken } from '../../../utils/clipping/instagramMedia'
import { serveClipFile } from '../../../utils/serveClipFile'

// Adresse publique d'un clip pour Instagram : Meta telecharge la video depuis ici pendant la publication. Il faut un jeton signe, propre a
// ce clip et valable 2 heures (fabrique par le worker au moment de publier) ; sans lui, rien n'est servi.
export default defineEventHandler(async (event) => {
  if (event.method !== 'GET' && event.method !== 'HEAD') throw createError({ statusCode: 405, statusMessage: 'Methode non permise' })
  const id = parseId(getRouterParam(event, 'id'))
  const key = tokenKey()
  if (!key || !verifyInstagramVideoToken(key, id, String(getQuery(event).t ?? ''))) throw createError({ statusCode: 403, statusMessage: 'Lien expire ou invalide' })
  return serveClipFile(event, id)
})
