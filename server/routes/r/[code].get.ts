import { prisma } from '../../utils/prisma'
import { cookieOptions } from '../../utils/studioLogin'
import { referrerFromCode } from '../../utils/clipping/prismaReferral'
import { REF_COOKIE, REF_TTL_SEC } from '../../utils/referralCookie'

// Lien de parrainage (/r/CODE) : memorise le parrain dans un cookie fonctionnel de 30 jours, puis envoie vers la connexion.
// Un code inconnu ne casse rien : le visiteur arrive simplement sur la page d'accueil.
export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  const referrer = await referrerFromCode(prisma, code)
  if (!referrer) return sendRedirect(event, '/', 302)
  setCookie(event, REF_COOKIE, String(code), cookieOptions(event, REF_TTL_SEC))
  return sendRedirect(event, '/connexion', 302)
})
