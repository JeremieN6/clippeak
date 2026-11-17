// Plafond mensuel de clips par chaine (beta gratuite avec plafond, decision du porteur du 2026-10-31) : regles pures, testables.
// On compte les clips PRODUITS dans le mois (hors echecs de rendu), pas les VODs : c'est ce que le streamer voit et comprend.

import { FREE_CLIPS, FREE_LIVES } from './pricing.ts'

// Plafond par defaut = le quota gratuit (une seule source : ./pricing.ts). C'est aussi la valeur par defaut de la colonne
// `streamer_settings.monthly_clip_quota` : un reglage egal a cette valeur (ou absent) veut dire « pas de reglage particulier », donc le plan
// gratuit compte en LIVES. Un admin qui saisit ce chiffre remet donc la chaine sur le plan gratuit (c'est dit dans l'ecran admin).
export const DEFAULT_MONTHLY_CLIPS = FREE_CLIPS
export const isDefaultQuotaSetting = (setting: number | null | undefined): boolean => setting === undefined || setting === DEFAULT_MONTHLY_CLIPS

// Chaines de demonstration et de test (admin) : jamais plafonnees.
export const isQuotaExempt = (twitchId: string): boolean => twitchId === 'demo-clippeak' || twitchId.startsWith('test-')

// Debut du mois (UTC) : le compteur repart de zero le 1er de chaque mois.
export const monthStart = (now: Date = new Date()): Date => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
export const nextMonthStart = (now: Date = new Date()): Date => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

// Plafond effectif : null = illimite (chaine exemptee, ou plafond retire par l'admin) ; sinon le nombre de clips par mois.
// L'offre payante ajoute de la place sans jamais en retirer : on prend le plus grand entre le reglage de la chaine (defaut
// DEFAULT_MONTHLY_CLIPS, releve par l'admin) et le quota de l'offre (`planClips`, 0 si gratuit). Reglage a null (illimite, decide par l'admin) : illimite.
// `bonusClips` : clips gratuits de parrainage du mois, AJOUTES au plafond (ils ne comptent jamais comme une offre payante).
export function effectiveQuota(input: { twitchId: string, setting: number | null | undefined, planClips?: number, bonusClips?: number }): number | null {
  if (isQuotaExempt(input.twitchId)) return null
  if (input.setting === null) return null
  return Math.max(input.setting === undefined ? DEFAULT_MONTHLY_CLIPS : input.setting, input.planClips ?? 0) + Math.max(0, input.bonusClips ?? 0)
}

// Nombre de clips qu'on peut encore produire ce mois-ci (Infinity si illimite).
export function clipRoom(quota: number | null, used: number): number {
  if (quota === null) return Number.POSITIVE_INFINITY
  return Math.max(0, quota - Math.max(0, used))
}

// Comment le plafond se compte :
//  - « unlimited » : chaine de test/demo, ou plafond retire par l'admin ;
//  - « lives »     : gratuit sans reglage particulier : 2 lives par mois, decoupes en entier (aucune limite de clips par live) ;
//  - « clips »     : offre Creator (packs de clips) ou plafond de clips regle a la main par l'admin.
export type QuotaMode = 'unlimited' | 'lives' | 'clips'
export function quotaMode(input: { twitchId: string, setting: number | null | undefined, planClips?: number }): QuotaMode {
  if (isQuotaExempt(input.twitchId) || input.setting === null) return 'unlimited'
  if ((input.planClips ?? 0) > 0) return 'clips'
  return isDefaultQuotaSetting(input.setting) ? 'lives' : 'clips'
}

// Lives gratuits du mois : 2, plus 1 par parrainage active (voir waves.ts).
export const liveLimit = (bonusLives = 0): number => FREE_LIVES + Math.max(0, Math.floor(bonusLives))

// Une VOD deja admise ce mois-ci (ou avant) continue toujours ; une nouvelle VOD n'est admise que s'il reste un live.
export const liveRoom = (limit: number, used: number): number => Math.max(0, limit - Math.max(0, used))

// `unit` dit ce que `limit` et `used` comptent : des clips, ou des lives (dans ce cas `clipsUsed` garde le nombre de clips du mois).
export interface QuotaView { limit: number | null, used: number, remaining: number | null, reached: boolean, resetsAt: string, bonus: number, unit: 'clips' | 'lives', clipsUsed: number }

export function quotaView(quota: number | null, used: number, now: Date = new Date(), bonus = 0): QuotaView {
  const room = clipRoom(quota, used)
  return { limit: quota, used, remaining: Number.isFinite(room) ? room : null, reached: room === 0, resetsAt: nextMonthStart(now).toISOString(), bonus, unit: 'clips', clipsUsed: used }
}

export function liveQuotaView(limit: number, livesUsed: number, clipsUsed: number, now: Date = new Date(), bonus = 0): QuotaView {
  const room = liveRoom(limit, livesUsed)
  return { limit, used: livesUsed, remaining: room, reached: room === 0, resetsAt: nextMonthStart(now).toISOString(), bonus, unit: 'lives', clipsUsed }
}

// Plafond saisi par l'admin : entier de 0 a 1000, ou null pour retirer le plafond.
export function parseQuotaInput(value: unknown): { ok: true, value: number | null } | { ok: false } {
  if (value === null) return { ok: true, value: null }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1000) return { ok: true, value }
  return { ok: false }
}

// Niveau du plafond pour les messages du studio : « near » a partir de 80 % (message court), « reached » a 100 % (message complet).
export type QuotaLevel = 'ok' | 'near' | 'reached'
export const NEAR_QUOTA_SHARE = 0.8
export function quotaLevel(view: { limit: number | null, used: number }): QuotaLevel {
  if (view.limit === null) return 'ok'
  if (view.used >= view.limit) return 'reached'
  return view.limit > 0 && view.used / view.limit >= NEAR_QUOTA_SHARE ? 'near' : 'ok'
}
