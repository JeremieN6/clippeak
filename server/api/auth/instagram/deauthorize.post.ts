import { instagramUserFromSignedRequest, removeInstagramConnections } from '../../../utils/instagramCallbacks'

// Rappel de Meta : le streamer a retire Clippeak dans les reglages d'Instagram. On efface son jeton chez nous.
export default defineEventHandler(async (event) => {
  const userId = await instagramUserFromSignedRequest(event)
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'Requete invalide' })
  await removeInstagramConnections(userId)
  return { ok: true }
})
