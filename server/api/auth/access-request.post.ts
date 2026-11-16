import { prisma } from '../../utils/prisma'
import { assertSameOrigin, clientIp } from '../../utils/studioAuth'
import { createRateLimiter } from '../../utils/clipping/adminAuth'
import { readWaitCookie } from '../../utils/accessRequest'
import { notifyAdmin } from '../../utils/adminNotify'
import { loadInvitationConfig, queuePosition } from '../../utils/clipping/prismaWaves'
import { referrerFromCode } from '../../utils/clipping/prismaReferral'
import { referralAllowed } from '../../utils/clipping/waves'
import { REF_COOKIE } from '../../utils/referralCookie'

const limiter = createRateLimiter(5, 60_000)

// « Reserver ma place » de la page d'attente : enregistre la demande d'acces du streamer qui vient de se connecter avec Twitch.
// L'identite vient du cookie signe pose au retour de Twitch (jamais du corps de la requete) : on ne peut demander que pour soi.
// Le cookie d'identite reste 15 minutes : la page d'attente s'en sert pour afficher la place dans la file et detecter l'invitation.
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  if (!limiter.attempt(clientIp(event))) throw createError({ statusCode: 429, statusMessage: 'Trop de demandes, reessaie dans une minute' })
  const who = readWaitCookie(event)
  if (!who) throw createError({ statusCode: 400, statusMessage: 'Reconnecte-toi avec Twitch pour envoyer ta demande.' })
  // Deja invite (entre-temps) : rien a enregistrer, il peut se connecter.
  if (await prisma.channelInvite.findFirst({ where: { OR: [{ twitchId: who.id }, { twitchLogin: who.login }] }, select: { id: true } })) return { ok: true, invited: true, position: null, total: 0 }
  const known = await prisma.accessRequest.findUnique({ where: { twitchId: who.id }, select: { id: true } })
  // Parrain : lien /r/CODE suivi avant la connexion. Un faux parrainage (son propre code) est ignore sans bruit.
  const referrer = await referrerFromCode(prisma, getCookie(event, REF_COOKIE))
  const referredBy = referrer && referralAllowed({ channelId: '', channelTwitchId: who.id, referrerId: referrer.id, referrerTwitchId: referrer.twitchId }) ? referrer.id : null
  await prisma.accessRequest.upsert({
    where: { twitchId: who.id },
    update: { twitchLogin: who.login, displayName: who.displayName, ...(referredBy ? { referredByChannelId: referredBy } : {}) },
    create: { twitchId: who.id, twitchLogin: who.login, displayName: who.displayName, referredByChannelId: referredBy }
  })
  const place = await queuePosition(prisma, who.id)
  // Une seule alerte par streamer (un second clic ne renvoie rien). Sans attendre la reponse de Telegram.
  // Vagues automatiques actives : pas d'alerte par demande (le jour du lancement elles seraient des centaines), un resume part avec la vague.
  if (!known && !(await loadInvitationConfig(prisma)).wavesEnabled) {
    const when = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'full', timeStyle: 'short' })
    void notifyAdmin([
      'Nouvelle demande d\'acces Clippeak',
      `Pseudo : ${who.displayName || who.login} (${who.login})`,
      `Date : ${when}`,
      `Chaine : https://twitch.tv/${who.login}`,
      `En liste d'attente : ${place?.total ?? 1}`,
      'Inviter : /admin, onglet Invitations'
    ].join('\n'))
  }
  return { ok: true, invited: false, position: place?.position ?? null, total: place?.total ?? 0 }
})
