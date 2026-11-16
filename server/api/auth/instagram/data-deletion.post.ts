import { randomUUID } from 'node:crypto'
import { instagramUserFromSignedRequest, removeInstagramConnections } from '../../../utils/instagramCallbacks'

// Rappel de Meta : demande de suppression des donnees d'un compte Instagram. Clippeak ne garde que le jeton chiffre et le nom du compte :
// les deux sont effaces tout de suite. Reponse attendue par Meta : une adresse de suivi et un code de confirmation.
export default defineEventHandler(async (event) => {
  const userId = await instagramUserFromSignedRequest(event)
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'Requete invalide' })
  await removeInstagramConnections(userId)
  return { url: 'https://clippeak.sassify.fr/confidentialite#instagram', confirmation_code: randomUUID() }
})
