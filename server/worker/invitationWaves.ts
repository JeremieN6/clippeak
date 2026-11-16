import { prisma } from '../utils/prisma'
import { runWave } from '../utils/clipping/prismaWaves'
import { sendAdminMessage } from './notify'

let lastRun = 0
let lastSummaryDay = ''

// Vagues d'invitations : une passe par heure. Elle invite les plus anciennes demandes d'acces (les parraines d'abord) tant que les vagues
// sont actives, que le serveur est calme (verdict « ok » sur les dernieres mesures) et que le plafond du jour n'est pas atteint. Elle ne
// compte pas comme un travail : elle ne fait jamais tourner la boucle plus vite. Si le worker est occupe a rendre des clips, elle attend
// la prochaine pause, ce qui protege aussi le serveur.
export async function invitationWavesStep(): Promise<boolean> {
  if (Date.now() - lastRun < 3600_000) return false
  lastRun = Date.now()
  try {
    const result = await runWave(prisma)
    if (result.invited.length) {
      console.info(`[worker] vague d'invitations : ${result.invited.length} chaine(s) invitee(s) (${result.invited.join(', ')})`)
      // Un seul message par jour, a la premiere vague : le porteur sait que ca tourne sans etre noye de messages.
      const day = new Date().toISOString().slice(0, 10)
      if (day !== lastSummaryDay) {
        lastSummaryDay = day
        const waiting = await prisma.accessRequest.count()
        await sendAdminMessage(`Clippeak : la premiere vague du jour a invite ${result.invited.length} chaine(s). Encore ${waiting} en file d'attente. Voir /admin, onglet Vagues.`)
      }
    } else if (result.reason === 'server') {
      console.info('[worker] vague d\u2019invitations suspendue : le serveur n\u2019est pas assez calme')
    }
  } catch (error) {
    console.error('[worker] vague d\u2019invitations impossible', error instanceof Error ? error.message : error)
  }
  return false
}
