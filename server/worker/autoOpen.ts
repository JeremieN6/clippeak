import { prisma } from '../utils/prisma'
import { runAutoOpen } from '../utils/clipping/prismaAutoOpen'
import { sendAdminMessage } from './notify'

let lastRun = 0
let lastWarnedKey = ''

// Ouverture automatique par lots : une passe toutes les 30 minutes (jamais un travail : elle ne fait pas tourner la boucle plus vite).
// Ouvre le lot suivant seulement si le precedent se gere bien (voir batchHealth.ts). Le porteur est prevenu quand un lot s'ouvre, et une seule
// fois par jour et par cause quand un lot complet reste bloque.
export async function autoOpenStep(): Promise<boolean> {
  if (Date.now() - lastRun < 1800_000) return false
  lastRun = Date.now()
  try {
    const result = await runAutoOpen(prisma)
    const h = result.health
    if (result.opened) {
      console.info(`[worker] ouverture automatique : ${result.opened} places de plus (${h?.good}/${h?.evaluated} premiers clips en moins de 24 h)`)
      await sendAdminMessage(`Clippeak : le dernier lot se gere bien (${h?.good}/${h?.evaluated} premiers clips en moins de 24 h, serveur calme ${Math.round((h?.calmShare ?? 0) * 100)} % du temps). ${result.opened} nouvelles places sont ouvertes. Voir /admin, onglet Vagues.`)
    } else if (result.reason === 'slow_clips' || result.reason === 'server') {
      const key = `${new Date().toISOString().slice(0, 10)}:${result.reason}`
      if (key !== lastWarnedKey) {
        lastWarnedKey = key
        const why = result.reason === 'slow_clips' ? `seulement ${h?.good}/${h?.evaluated} premiers clips en moins de 24 h` : `le serveur n'est calme que ${Math.round((h?.calmShare ?? 0) * 100)} % du temps`
        await sendAdminMessage(`Clippeak : des gens attendent mais le prochain lot reste ferme (${why}). Voir /admin, onglet Vagues.`)
      }
    }
  } catch (error) {
    console.error('[worker] ouverture automatique impossible', error instanceof Error ? error.message : error)
  }
  return false
}
