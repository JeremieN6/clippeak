import type { H3Event } from 'h3'
import { mediaSecret } from './studioAuth'
import { cookieOptions } from './studioLogin'
import { signMediaToken, verifyMediaToken } from './clipping/adminAuth'

// Identite Twitch d'un streamer non invite, gardee 15 minutes dans un cookie SIGNE (illisible par la page, non falsifiable) :
// la page d'attente peut ainsi enregistrer SA demande, et seulement la sienne, quand il clique.
export const WAIT_COOKIE = 'clippeak_wait'
const WAIT_TTL_MS = 15 * 60 * 1000

export function setWaitCookie(event: H3Event, who: { id: string, login: string, displayName: string }): void {
  const payload = Buffer.from(JSON.stringify({ i: who.id, l: who.login, n: who.displayName.slice(0, 60) })).toString('base64url')
  const token = signMediaToken(mediaSecret(event), `wait:${payload}`, Date.now() + WAIT_TTL_MS)
  setCookie(event, WAIT_COOKIE, `${payload}.${token}`, cookieOptions(event, WAIT_TTL_MS / 1000))
}

export function readWaitCookie(event: H3Event): { id: string, login: string, displayName: string } | null {
  const raw = getCookie(event, WAIT_COOKIE)
  const cut = raw?.indexOf('.') ?? -1
  if (!raw || cut < 1) return null
  const payload = raw.slice(0, cut)
  if (!verifyMediaToken(mediaSecret(event), `wait:${payload}`, raw.slice(cut + 1))) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { i?: unknown, l?: unknown, n?: unknown }
    if (typeof data.i !== 'string' || typeof data.l !== 'string' || !/^[A-Za-z0-9_]{3,25}$/.test(data.l) || data.i.length > 40) return null
    return { id: data.i, login: data.l.toLowerCase(), displayName: typeof data.n === 'string' ? data.n : data.l }
  } catch { return null }
}
