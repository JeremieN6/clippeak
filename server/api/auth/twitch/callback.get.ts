import type { H3Event } from 'h3'
import { prisma } from '../../../utils/prisma'
import { readEnv } from '../../../utils/env'
import { cookieOptions, loginConfig } from '../../../utils/studioLogin'
import { safeEqual } from '../../../utils/clipping/adminAuth'
import { createTwitchApi } from '../../../utils/clipping/twitchApi'
import { registerWelcomeVods } from '../../../utils/clipping/welcomeVods'
import { prismaVodStore, countChannelVods } from '../../../utils/clipping/prismaVodStore'
import { setWaitCookie } from '../../../utils/accessRequest'
import { attachReferral, referrerFromCode } from '../../../utils/clipping/prismaReferral'
import { REF_COOKIE } from '../../../utils/referralCookie'
import { exchangeCode, fetchIdentity, hashToken, newToken, SESSION_COOKIE, SESSION_TTL_MS, STATE_COOKIE } from '../../../utils/clipping/twitchLogin'

// Connexion reussie : le studio. Sinon : retour sur la page de connexion avec la raison.
const back = (event: H3Event, result: string) => sendRedirect(event, result === 'ok' ? '/studio' : `/connexion?login=${result}`, 302)

// Chaine non invitee : page d'attente (avec son pseudo Twitch, public) plutot qu'une erreur.
const waiting = (event: H3Event, login: string) => sendRedirect(event, `/attente?login=${encodeURIComponent(login)}`, 302)

// Retour de Twitch : verifie l'etat, lit l'identite du streamer, accepte seulement les chaines invitees, cree sa chaine au premier
// passage (et l'ecoute de ses lives), puis ouvre une session. Le jeton Twitch n'est jamais conserve.
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const expected = getCookie(event, STATE_COOKIE) ?? ''
  deleteCookie(event, STATE_COOKIE, { path: '/api/auth' })
  const state = typeof query.state === 'string' ? query.state : ''
  const code = typeof query.code === 'string' ? query.code : ''
  if (query.error) return back(event, 'cancelled')
  if (!expected || !state || !safeEqual(state, expected) || !code) return back(event, 'error')

  const config = loginConfig(event)
  if (!config.configured) return back(event, 'error')

  let identity
  try {
    const accessToken = await exchangeCode(fetch, { clientId: config.clientId, clientSecret: config.clientSecret, code, redirectUri: config.redirectUri, idBase: readEnv('TWITCH_ID_BASE_URL') || undefined })
    identity = await fetchIdentity(fetch, { clientId: config.clientId, accessToken, apiBase: readEnv('TWITCH_API_BASE_URL') || undefined })
  } catch (error) {
    console.error('[login] echec Twitch', error instanceof Error ? error.message : error)
    return back(event, 'error')
  }

  // Inscription sur invitation : le pseudo (ou l'identifiant Twitch deja enregistre) doit etre dans la liste de l'admin.
  const invite = await prisma.channelInvite.findFirst({ where: { OR: [{ twitchId: identity.id }, { twitchLogin: identity.login }] } })
  if (!invite) {
    // Rien n'est enregistre ici : seule l'identite est gardee 15 min dans un cookie signe, pour le bouton « Previens-moi » de la page d'attente.
    setWaitCookie(event, { id: identity.id, login: identity.login, displayName: identity.displayName })
    return waiting(event, identity.login)
  }

  const firstLogin = !invite.twitchId
  const channel = await prisma.channel.upsert({
    where: { twitchId: identity.id },
    update: { login: identity.login, displayName: identity.displayName },
    create: { twitchId: identity.id, login: identity.login, displayName: identity.displayName, settings: { create: {} } }
  })
  await prisma.channelInvite.update({ where: { id: invite.id }, data: { twitchId: identity.id, twitchLogin: identity.login, lastLoginAt: new Date() } })
  await prisma.accessRequest.deleteMany({ where: { twitchId: identity.id } })

  // Parrainage : a la toute premiere connexion seulement, le parrain vient de la demande d'acces (invitation) ou du lien suivi (cookie).
  // Un echec ici ne bloque jamais la connexion. Faux parrainages (meme compte, chaine de test) refuses par attachReferral.
  if (firstLogin) {
    try {
      const referrerId = invite.referredByChannelId ?? (await referrerFromCode(prisma, getCookie(event, REF_COOKIE)))?.id
      if (referrerId) await attachReferral(prisma, { id: channel.id, twitchId: channel.twitchId }, referrerId)
    } catch (error) {
      console.error('[login] parrainage impossible', error instanceof Error ? error.message : error)
    }
  }
  deleteCookie(event, REF_COOKIE, { path: '/' })

  // Ecoute des lives de la chaine (idempotent). Un echec ne bloque pas la connexion : le rattrapage periodique comble le reste.
  const secret = readEnv('TWITCH_EVENTSUB_SECRET')
  const callback = readEnv('TWITCH_EVENTSUB_CALLBACK_URL')
  if (firstLogin && secret && callback) {
    try {
      const api = createTwitchApi({ clientId: config.clientId, clientSecret: config.clientSecret })
      await api.subscribe('stream.online', identity.id, callback, secret)
      await api.subscribe('stream.offline', identity.id, callback, secret)
    } catch (error) {
      console.error('[login] abonnement EventSub impossible', error instanceof Error ? error.message : error)
    }
  }

  // Demarrage rapide : les derniers lives passes sont enregistres tout de suite (analyse sans attendre le prochain direct, reglages par defaut).
  // Borne a 6 s et sans effet sur la connexion en cas d'echec : le rattrapage periodique reessaie (voir vodCatchup.ts).
  if (config.clientId && config.clientSecret) {
    try {
      const api = createTwitchApi({ clientId: config.clientId, clientSecret: config.clientSecret, apiBase: readEnv('TWITCH_API_BASE_URL') || undefined, idBase: readEnv('TWITCH_ID_BASE_URL') || undefined })
      const store = { upsertVod: prismaVodStore.upsertVod, countVods: countChannelVods }
      const registered = await Promise.race([
        registerWelcomeVods({ id: channel.id, twitchId: identity.id }, { api, store }),
        new Promise<number>((resolve) => { setTimeout(() => resolve(0), 6000) })
      ])
      if (registered) console.info(`[login] ${registered} live${registered > 1 ? 's' : ''} recent${registered > 1 ? 's' : ''} enregistre${registered > 1 ? 's' : ''} pour l'analyse`)
    } catch (error) {
      console.error('[login] reprise des derniers lives impossible', error instanceof Error ? error.message : error)
    }
  }

  const token = newToken()
  await prisma.studioSession.create({ data: { channelId: channel.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) } })
  await prisma.studioSession.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  setCookie(event, SESSION_COOKIE, token, cookieOptions(event, Math.floor(SESSION_TTL_MS / 1000)))
  return back(event, 'ok')
})
