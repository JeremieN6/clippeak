import { createHmac } from 'node:crypto'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { readEnv } from './env'
import { createRateLimiter, safeEqual, signMediaToken, verifyMediaToken } from './clipping/adminAuth'
import { hashToken, SESSION_COOKIE } from './clipping/twitchLogin'
import { prisma } from './prisma'

const limiter = createRateLimiter(10, 60_000)

export const uuidSchema = z.string().uuid()

export function parseId(value: unknown): string {
  const parsed = uuidSchema.safeParse(value)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Identifiant invalide' })
  return parsed.data
}

function adminPassword(event: H3Event): string {
  return (useRuntimeConfig(event).adminPassword || readEnv('ADMIN_PASSWORD')).trim()
}

// Secret des jetons video : derive du mot de passe admin, donc invalide si celui-ci change ; jamais expose.
export function mediaSecret(event: H3Event): string {
  return createHmac('sha256', 'clippeak-media').update(adminPassword(event)).digest('hex')
}

export const ADMIN_COOKIE = 'clippeak_admin'
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000

// Secret de la session admin : derive du mot de passe admin, donc invalide si celui-ci change ; jamais expose.
function adminSessionSecret(event: H3Event): string {
  return createHmac('sha256', 'clippeak-admin-session').update(adminPassword(event)).digest('hex')
}

// Adresse du visiteur pour les limites d'essais : X-Real-IP est ECRASEE par nginx (`proxy_set_header X-Real-IP $remote_addr`), donc
// non falsifiable ; X-Forwarded-For, lui, est transmis tel quel par ce nginx et peut etre invente par le client (contournement de la limite).
export function clientIp(event: H3Event): string {
  return getHeader(event, 'x-real-ip')?.trim() || getRequestIP(event) || 'inconnue'
}

// Verifie le mot de passe admin (comparaison en temps constant, 10 echecs par minute et par adresse au maximum).
export function checkAdminPassword(event: H3Event, provided: string): void {
  const ip = clientIp(event)
  const expected = adminPassword(event)
  if (!expected) throw createError({ statusCode: 503, statusMessage: 'Back-office non configure' })
  if (safeEqual(provided.trim(), expected)) {
    limiter.reset(ip)
    return
  }
  if (!limiter.attempt(ip)) throw createError({ statusCode: 429, statusMessage: 'Trop de tentatives, reessayez dans une minute' })
  throw createError({ statusCode: 401, statusMessage: 'Acces refuse' })
}

// Jeton de session admin (signe, 12 h) pose dans un cookie HttpOnly apres la saisie du mot de passe sur /admin.
export function newAdminSession(event: H3Event): string {
  return signMediaToken(adminSessionSecret(event), 'admin-session', Date.now() + ADMIN_SESSION_TTL_MS)
}

function hasAdminCookie(event: H3Event): boolean {
  const token = getCookie(event, ADMIN_COOKIE)
  return Boolean(token && adminPassword(event) && verifyMediaToken(adminSessionSecret(event), 'admin-session', token))
}

// Les requetes qui modifient quelque chose et qui portent seulement un cookie doivent venir de notre propre site
// (controle de l'origine, en plus de SameSite=Lax).
export function assertSameOrigin(event: H3Event): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(event.method)) return
  const origin = getHeader(event, 'origin')
  if (!origin) return
  let host = ''
  try { host = new URL(origin).host } catch { /* origine illisible : refusee ci-dessous */ }
  if (host !== getRequestHost(event, { xForwardedHost: true })) throw createError({ statusCode: 403, statusMessage: 'Origine refusee' })
}

// Protege le back-office : session admin (cookie pose par /admin) ou, pour les scripts, mot de passe dans l'en-tete
// x-admin-password (jamais dans l'URL).
export function requireStudioAdmin(event: H3Event): void {
  const header = getHeader(event, 'x-admin-password')
  if (header !== undefined) return checkAdminPassword(event, header)
  if (hasAdminCookie(event)) return assertSameOrigin(event)
  throw createError({ statusCode: 401, statusMessage: 'Acces refuse' })
}

// Qui appelle : l'admin (voit tout) ou un streamer connecte avec Twitch (cookie de session, ne voit que sa chaine).
export interface StudioActor {
  admin: boolean
  channelId: string | null
}

// Admin d'abord (en-tete ou cookie de session admin), sinon cookie de session du streamer.
export async function requireStudioActor(event: H3Event): Promise<StudioActor> {
  if (getHeader(event, 'x-admin-password') !== undefined || hasAdminCookie(event)) {
    requireStudioAdmin(event)
    return { admin: true, channelId: null }
  }

  const token = getCookie(event, SESSION_COOKIE)
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })
  const session = await prisma.studioSession.findUnique({ where: { tokenHash: hashToken(token) }, select: { channelId: true, expiresAt: true } })
  if (!session || session.expiresAt.getTime() < Date.now()) throw createError({ statusCode: 401, statusMessage: 'Session expiree' })
  assertSameOrigin(event)
  return { admin: false, channelId: session.channelId }
}

// Un streamer ne touche qu'a sa chaine : toute autre chaine est « introuvable » (on ne revele pas qu'elle existe).
export function assertChannel(actor: StudioActor, channelId: string): void {
  if (!actor.admin && actor.channelId !== channelId) throw createError({ statusCode: 404, statusMessage: 'Streamer introuvable' })
}
