import { z } from 'zod'
import { prisma } from '../../utils/prisma'
import { readEnv } from '../../utils/env'
import { cookieOptions } from '../../utils/studioLogin'
import { clientIp } from '../../utils/studioAuth'
import { safeEqual, createRateLimiter } from '../../utils/clipping/adminAuth'
import { hashToken, newToken, SESSION_COOKIE, SESSION_TTL_MS } from '../../utils/clipping/twitchLogin'
import { ensureReviewerChannel } from '../../utils/reviewerChannel'

const limiter = createRateLimiter(10, 60_000)
const schema = z.object({ code: z.string().min(1).max(200) })

// Entree de l'equipe de relecture de Meta : un code (REVIEWER_CODE) ouvre une session sur la chaine « Relecture Meta » et sur elle seule.
// Sans REVIEWER_CODE dans l'environnement, la route n'existe pas (404). 10 essais par minute et par adresse. Le code n'est jamais renvoye.
export default defineEventHandler(async (event) => {
  const expected = readEnv('REVIEWER_CODE').trim()
  if (expected.length < 12) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Code requis' })
  const ip = clientIp(event)
  if (!safeEqual(parsed.data.code.trim(), expected)) {
    if (!limiter.attempt(ip)) throw createError({ statusCode: 429, statusMessage: 'Trop de tentatives, réessaie dans une minute' })
    throw createError({ statusCode: 401, statusMessage: 'Code refusé' })
  }
  limiter.reset(ip)
  const channel = await ensureReviewerChannel()
  const token = newToken()
  await prisma.studioSession.create({ data: { channelId: channel.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) } })
  await prisma.studioSession.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  setCookie(event, SESSION_COOKIE, token, cookieOptions(event, Math.floor(SESSION_TTL_MS / 1000)))
  return { ok: true }
})
