// Prix et packs de l'offre : regles pures, SANS dependance (le navigateur les importe aussi, pour la landing). Le prix reellement paye est celui
// du prix Stripe ; les valeurs d'affichage ci-dessous doivent lui rester identiques.

// Gratuit : 20 clips par mois (decision du porteur, 2026-11-14 : assez pour voir la valeur, assez peu pour donner envie du plan superieur).
export const FREE_CLIPS = 20
// Packs : l'offre Creator s'achete par packs de 120 clips par mois (de 1 a 5, meme prix unitaire). Le nombre de packs est la QUANTITE de
// l'abonnement Stripe ; le plafond mensuel = 120 x packs.
export const CLIPS_PER_PACK = 120
export const MAX_PACKS = 5

export const clampPacks = (value: unknown): number => {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) ? Math.min(MAX_PACKS, Math.max(1, n)) : 1
}
export const packsClips = (packs: unknown): number => CLIPS_PER_PACK * clampPacks(packs)

export type BillingInterval = 'month' | 'year'
export const normalizeInterval = (value: unknown): BillingInterval | null => value === 'month' || value === 'year' ? value : null

// Prix AFFICHES sur la landing (euros, sans TVA : franchise en base). Annuel par defaut : 12 EUR par mois, facture 144 EUR par an,
// au lieu de 19 x 12 = 228 EUR.
export const CREATOR_PRICE = { monthly: 19, yearly: 144 }
export function yearlySaving(monthly: number, yearly: number): { fullYear: number, saved: number, percent: number, perMonth: number } {
  const fullYear = monthly * 12
  const saved = Math.max(0, fullYear - yearly)
  return { fullYear, saved, percent: fullYear > 0 ? Math.round(saved / fullYear * 100) : 0, perMonth: Math.round(yearly / 12 * 100) / 100 }
}
