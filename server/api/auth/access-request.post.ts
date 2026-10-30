import { prisma } from '../../utils/prisma'
import { assertSameOrigin, clientIp } from '../../utils/studioAuth'
import { createRateLimiter } from '../../utils/clipping/adminAuth'
import { readWaitCookie, WAIT_COOKIE } from '../../utils/accessRequest'

const limiter = createRateLimiter(5, 60_000)

// « Previens-moi » de la page d'attente : enregistre la demande d'acces du streamer qui vient de se connecter avec Twitch.
// L'identite vient du cookie signe pose au retour de Twitch (jamais du corps de la requete) : on ne peut demander que pour soi.
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  if (!limiter.attempt(clientIp(event))) throw createError({ statusCode: 429, statusMessage: 'Trop de demandes, reessaie dans une minute' })
  const who = readWaitCookie(event)
  if (!who) throw createError({ statusCode: 400, statusMessage: 'Reconnecte-toi avec Twitch pour envoyer ta demande.' })
  // Deja invite (entre-temps) : rien a enregistrer, il peut se connecter.
  if (await prisma.channelInvite.findFirst({ where: { OR: [{ twitchId: who.id }, { twitchLogin: who.login }] }, select: { id: true } })) return { ok: true, invited: true }
  await prisma.accessRequest.upsert({
    where: { twitchId: who.id },
    update: { twitchLogin: who.login, displayName: who.displayName },
    create: { twitchId: who.id, twitchLogin: who.login, displayName: who.displayName }
  })
  deleteCookie(event, WAIT_COOKIE, { path: '/' })
  return { ok: true, invited: false }
})
