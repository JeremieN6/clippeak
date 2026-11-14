// Qui peut utiliser les extraits longs YouTube : l'offre Creator (abonnement en cours), les chaines de demonstration et de test, et les chaines
// a qui l'admin a accorde un plafond illimite. Le plan gratuit ne les a pas (argument de l'offre payante). Regles pures, partagees par le site
// et le worker.
import { PAYING_STATUSES, isPayingStatus } from './billing.ts'
import { isQuotaExempt } from './quota.ts'

export const LONG_LOCKED_MESSAGE = 'Les extraits longs sont réservés à l’offre Creator.'

export function canUseLongExtracts(input: { twitchId: string, billingStatus: string | null | undefined, quotaSetting: number | null | undefined }): boolean {
  return isPayingStatus(input.billingStatus) || isQuotaExempt(input.twitchId) || input.quotaSetting === null
}

// Meme regle sous forme de filtre Prisma sur une chaine (le worker choisit les lives a lire directement en base). A garder identique a la
// fonction ci-dessus : le test de `longAccess.test.ts` et celui de la base le verifient.
export const LONG_ACCESS_CHANNEL_FILTER = {
  OR: [
    { billing: { is: { status: { in: PAYING_STATUSES } } } },
    { twitchId: 'demo-clippeak' },
    { twitchId: { startsWith: 'test-' } },
    { settings: { is: { monthlyClipQuota: null } } }
  ]
}
