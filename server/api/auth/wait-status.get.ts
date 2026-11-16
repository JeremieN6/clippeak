import { prisma } from '../../utils/prisma'
import { readWaitCookie } from '../../utils/accessRequest'
import { waitStatus } from '../../utils/clipping/prismaWaves'

// Etat de la file d'attente pour la page /attente (lue toutes les minutes) : invite ou non, place, etat des vagues du jour.
// L'identite vient du cookie signe pose au retour de Twitch (15 minutes) : on ne peut lire que SA place.
export default defineEventHandler(async (event) => {
  const who = readWaitCookie(event)
  if (!who) throw createError({ statusCode: 401, statusMessage: 'Reconnecte-toi avec Twitch pour voir ta place.' })
  setResponseHeader(event, 'cache-control', 'no-store')
  return waitStatus(prisma, who)
})
