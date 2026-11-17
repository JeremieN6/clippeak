import type { H3Event } from 'h3'
import { prisma } from './prisma'
import { requireStudioActor } from './studioAuth'
import { tokenKey } from './publishConfig'
import { safeEqual } from './clipping/adminAuth'

// Retour OAuth d'une plateforme de publication (YouTube, TikTok, Instagram) : la partie commune a toutes. Verifie la session et l'etat
// anti-falsification, appelle `connect` (propre a la plateforme : echange du code, jetons chiffres) puis range la connexion de la chaine du
// streamer connecte. Les routes `/api/auth/<plateforme>/callback` ne gardent que ce qui les distingue.
export interface ConnectionData {
  accessTokenEnc: string
  refreshTokenEnc: string
  expiresAt: Date | null
  scopes: string
  accountName?: string | null
  externalId?: string
}

export interface OAuthCallbackOptions {
  platform: 'youtube' | 'tiktok' | 'instagram'
  stateCookie: string
  config: { configured: boolean }
  // Nettoyage du code recu (Meta ajoute « #_ » a la fin).
  cleanCode?: (code: string) => string
  // Controle avant l'echange (ex. chaine de test ou de demonstration) : renvoie le resultat de redirection a employer, ou null pour continuer.
  precheck?: (channelId: string) => Promise<string | null>
  // Echange le code et renvoie ce qu'il faut ranger, ou un resultat de redirection (texte) quand il n'y a rien a ranger.
  connect: (code: string, key: string) => Promise<ConnectionData | string>
}

export async function finishOAuthCallback(event: H3Event, options: OAuthCallbackOptions) {
  const back = (result: string) => sendRedirect(event, result === 'error' ? `/studio?connect=error&platform=${options.platform}` : `/studio?connect=${result}`, 302)
  const query = getQuery(event)
  const expected = getCookie(event, options.stateCookie) ?? ''
  deleteCookie(event, options.stateCookie, { path: '/api/auth' })
  const actor = await requireStudioActor(event).catch(() => null)
  if (!actor) return sendRedirect(event, '/connexion', 302)
  if (actor.admin || !actor.channelId) return back('admin')

  if (query.error) return back('cancelled')
  const state = typeof query.state === 'string' ? query.state : ''
  const received = typeof query.code === 'string' ? query.code : ''
  const code = options.cleanCode ? options.cleanCode(received) : received
  if (!expected || !state || !safeEqual(state, expected) || !code) return back('error')

  const key = tokenKey()
  if (!options.config.configured || !key) return back('unavailable')
  const early = options.precheck ? await options.precheck(actor.channelId) : null
  if (early) return back(early)

  try {
    const result = await options.connect(code, key)
    if (typeof result === 'string') return back(result)
    await prisma.platformConnection.upsert({
      where: { channelId_platform: { channelId: actor.channelId, platform: options.platform } },
      update: result,
      create: { channelId: actor.channelId, platform: options.platform, ...result }
    })
  } catch (error) {
    console.error(`[${options.platform}] connexion impossible`, error instanceof Error ? error.message : error)
    return back('error')
  }
  return back(options.platform)
}
