import { prisma } from '../../utils/prisma'
import { requireStudioAdmin } from '../../utils/studioAuth'
import { loadFunnel } from '../../utils/clipping/prismaFunnel'

// Entonnoir d'acquisition (onglet « Entonnoir » de /admin) : comptes exacts depuis la base, sans consentement requis car aucune donnee
// personnelle n'est renvoyee (nombres, taux, delais, courbe par semaine). Admin seulement.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  return loadFunnel(prisma)
})
