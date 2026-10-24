import { createHmac } from 'node:crypto'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { readEnv } from './env'
import { createRateLimiter, safeEqual } from './clipping/adminAuth'

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
