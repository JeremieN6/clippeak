import { prisma } from '../../utils/prisma'
import { requireStudioAdmin } from '../../utils/studioAuth'

// Reponses du formulaire de feedback de la landing (admin seulement : session de /admin ou en-tete x-admin-password).
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)

  const feedbacks = await prisma.feedback.findMany({
    orderBy: { createdAt: 'desc' }
  })

  const total = feedbacks.length
  const automationOui = feedbacks.filter((f) => f.outilAutomatise === 'oui').length
  const automationOuiPct = total > 0 ? Math.round((automationOui / total) * 100) : 0

  const plateformeRepartition = feedbacks.reduce<Record<string, number>>((acc, current) => {
    const key = current.plateformeReception
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const profilRepartition = feedbacks.reduce<Record<string, number>>((acc, current) => {
    const key = current.profil
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  return {
    metrics: {
      total,
      automationOuiPct,
      plateformeRepartition,
      profilRepartition
    },
    feedbacks
  }
})
