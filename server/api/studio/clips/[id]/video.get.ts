import { mediaSecret, parseId } from '../../../../utils/studioAuth'
import { verifyMediaToken } from '../../../../utils/clipping/adminAuth'
import { serveClipFile } from '../../../../utils/serveClipFile'

// Lecture d'un clip dans le navigateur (balise <video>) avec jeton signe et lecture progressive (Range).
export default defineEventHandler(async (event) => {
  const id = parseId(getRouterParam(event, 'id'))
  const token = String(getQuery(event).t ?? '')
  if (!verifyMediaToken(mediaSecret(event), `clip:${id}`, token)) throw createError({ statusCode: 403, statusMessage: 'Lien expire ou invalide' })
  return serveClipFile(event, id)
})
