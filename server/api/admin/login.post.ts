import { z } from 'zod'
import { ADMIN_COOKIE, ADMIN_SESSION_TTL_MS, checkAdminPassword, newAdminSession } from '../../utils/studioAuth'
import { cookieOptions } from '../../utils/studioLogin'

const schema = z.object({ password: z.string().max(200) })

// Connexion admin : le mot de passe (saisi sur /admin) est verifie une fois, puis remplace par un cookie de session signe,
// illisible par la page. Le mot de passe ne reste ni dans la page ni dans une URL.
export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Mot de passe requis' })
  checkAdminPassword(event, parsed.data.password)
  setCookie(event, ADMIN_COOKIE, newAdminSession(event), cookieOptions(event, Math.floor(ADMIN_SESSION_TTL_MS / 1000)))
  return { ok: true }
})
