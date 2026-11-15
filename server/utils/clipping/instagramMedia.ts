// Lien video public signe pour Instagram : Meta telecharge elle-meme le clip depuis une URL publique. Le lien est propre a UN clip et expire
// vite ; sa signature vient de la cle des jetons de plateformes (le site et le worker la partagent), jamais du mot de passe admin.
import { createHmac } from 'node:crypto'
import { signMediaToken, verifyMediaToken } from './adminAuth.ts'

export const INSTAGRAM_VIDEO_TTL_MS = 2 * 60 * 60 * 1000

const secretFor = (tokenKey: Buffer): string => createHmac('sha256', tokenKey).update('clippeak-instagram-video').digest('hex')
const resource = (clipId: string) => `igclip:${clipId}`

export function instagramVideoUrl(publicBase: string, clipId: string, tokenKey: Buffer, nowMs: number = Date.now()): string {
  const token = signMediaToken(secretFor(tokenKey), resource(clipId), nowMs + INSTAGRAM_VIDEO_TTL_MS)
  return `${publicBase.replace(/\/+$/, '')}/api/media/instagram/${encodeURIComponent(clipId)}?t=${token}`
}

export const verifyInstagramVideoToken = (tokenKey: Buffer, clipId: string, token: string, nowMs: number = Date.now()): boolean =>
  verifyMediaToken(secretFor(tokenKey), resource(clipId), token, nowMs)
