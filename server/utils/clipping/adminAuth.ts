import { createHmac, timingSafeEqual } from 'node:crypto'

// Comparaison en temps constant : ne revele pas, par le temps de reponse, combien de caracteres sont corrects.
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) {
    // On compare quand meme pour ne pas court-circuiter sur la longueur.
    timingSafeEqual(left, left)
    return false
  }
  return timingSafeEqual(left, right)
}

export interface RateLimiter {
  // true si la tentative est autorisee.
  attempt: (key: string) => boolean
  reset: (key: string) => void
}

// Limite les tentatives de mot de passe : au plus `max` echecs par fenetre et par cle (adresse IP).
export function createRateLimiter(max = 10, windowMs = 60_000, now: () => number = () => Date.now()): RateLimiter {
  const failures = new Map<string, number[]>()
  return {
    attempt(key) {
      const recent = (failures.get(key) ?? []).filter(t => now() - t < windowMs)
      failures.set(key, recent)
      if (recent.length >= max) return false
      recent.push(now())
      return true
    },
    reset(key) {
      failures.delete(key)
    }
  }
}

// Jeton signe a duree limitee pour lire une video dans une balise <video> (qui ne peut pas envoyer d'en-tete) :
// evite de mettre le mot de passe admin dans l'URL.
export function signMediaToken(secret: string, resource: string, expiresAtMs: number): string {
  const payload = `${resource}.${expiresAtMs}`
  const mac = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${expiresAtMs}.${mac}`
}

export function verifyMediaToken(secret: string, resource: string, token: string, nowMs: number = Date.now()): boolean {
  const [expires, mac] = token.split('.')
  const expiresAt = Number(expires)
  if (!mac || !Number.isFinite(expiresAt) || expiresAt < nowMs) return false
  const expected = createHmac('sha256', secret).update(`${resource}.${expiresAt}`).digest('base64url')
  return safeEqual(mac, expected)
}

// Parse un en-tete Range ("bytes=0-1023") pour servir une video avec lecture progressive.
export function parseRange(header: string | undefined, size: number): { start: number, end: number } | null | 'invalid' {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (!match[1] && !match[2])) return 'invalid'
  let start: number
  let end: number
  if (!match[1]) {
    const suffix = Number(match[2])
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  }
  if (start > end || start >= size) return 'invalid'
  return { start, end }
}
