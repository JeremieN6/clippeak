import { parseId, requireStudioAdmin } from '../../../utils/studioAuth'
import { deleteTestChannel } from '../../../utils/demoChannel'

// Supprime une chaine de test et tout ce qu'elle contient (clips, extraits, photos). Jamais une vraie chaine.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const id = parseId(getRouterParam(event, 'id'))
  if (!(await deleteTestChannel(id))) throw createError({ statusCode: 404, statusMessage: 'Chaîne de test introuvable' })
  return { ok: true }
})
