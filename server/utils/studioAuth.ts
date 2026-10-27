import { createHmac } from 'node:crypto'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { readEnv } from './env'
import { createRateLimiter, safeEqual } from './clipping/adminAuth'
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

// Protege le back-office : mot de passe dans l'en-tete x-admin-password (jamais dans l'URL), comparaison en temps constant,
// 10 echecs par minute et par adresse au maximum.
export function requireStudioAdmin(event: H3Event): void {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'inconnue'
  const expected = adminPassword(event)
  const provided = (getHeader(event, 'x-admin-password') ?? '').trim()
  if (!expected) throw createError({ statusCode: 503, statusMessage: 'Back-office non configure' })
  if (safeEqual(provided, expected)) {
    limiter.reset(ip)
    return
  }
  if (!limiter.attempt(ip)) throw createError({ statusCode: 429, statusMessage: 'Trop de tentatives, reessayez dans une minute' })
  throw createError({ statusCode: 401, statusMessage: 'Acces refuse' })
}

// Qui appelle : l'admin (mot de passe, voit tout) ou un streamer connecte avec Twitch (cookie de session, ne voit que sa chaine).
export interface StudioActor {
  admin: boolean
  channelId: string | null
}

// Mot de passe admin dans l'en-tete, sinon cookie de session. Les requetes qui modifient quelque chose et qui portent seulement un
// cookie doivent venir de notre propre site (controle de l'origine, en plus de SameSite=Lax).
export async function requireStudioActor(event: H3Event): Promise<StudioActor> {
  if (getHeader(event, 'x-admin-password') !== undefined) {
    requireStudioAdmin(event)
    return { admin: true, channelId: null }
  }

  const token = getCookie(event, SESSION_COOKIE)
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })
  const session = await prisma.studioSession.findUnique({ where: { tokenHash: hashToken(token) }, select: { channelId: true, expiresAt: true } })
  if (!session || session.expiresAt.getTime() < Date.now()) throw createError({ statusCode: 401, statusMessage: 'Session expiree' })

  if (!['GET', 'HEAD', 'OPTIONS'].includes(event.method)) {
    const origin = getHeader(event, 'origin')
    if (origin) {
      let host = ''
      try { host = new URL(origin).host } catch { /* origine illisible : refusee ci-dessous */ }
      if (host !== getRequestHost(event, { xForwardedHost: true })) throw createError({ statusCode: 403, statusMessage: 'Origine refusee' })
    }
  }
  return { admin: false, channelId: session.channelId }
}

// Un streamer ne touche qu'a sa chaine : toute autre chaine est « introuvable » (on ne revele pas qu'elle existe).
export function assertChannel(actor: StudioActor, channelId: string): void {
  if (!actor.admin && actor.channelId !== channelId) throw createError({ statusCode: 404, statusMessage: 'Streamer introuvable' })
}
