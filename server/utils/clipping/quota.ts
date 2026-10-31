// Plafond mensuel de clips par chaine (beta gratuite avec plafond, decision du porteur du 2026-10-31) : regles pures, testables.
// On compte les clips PRODUITS dans le mois (hors echecs de rendu), pas les VODs : c'est ce que le streamer voit et comprend.

export const DEFAULT_MONTHLY_CLIPS = 40

// Chaines de demonstration et de test (admin) : jamais plafonnees.
export const isQuotaExempt = (twitchId: string): boolean => twitchId === 'demo-clippeak' || twitchId.startsWith('test-')

// Debut du mois (UTC) : le compteur repart de zero le 1er de chaque mois.
export const monthStart = (now: Date = new Date()): Date => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
export const nextMonthStart = (now: Date = new Date()): Date => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

// Plafond effectif : null = illimite (chaine exemptee, ou plafond retire par l'admin) ; sinon le nombre de clips par mois.
// L'offre payante ajoute de la place sans jamais en retirer : on prend le plus grand entre le reglage de la chaine (defaut 40, releve par
// l'admin) et le quota de l'offre (`planClips`, 0 si gratuit). Reglage a null (illimite, decide par l'admin) : illimite.
export function effectiveQuota(input: { twitchId: string, setting: number | null | undefined, planClips?: number }): number | null {
  if (isQuotaExempt(input.twitchId)) return null
  if (input.setting === null) return null
  return Math.max(input.setting === undefined ? DEFAULT_MONTHLY_CLIPS : input.setting, input.planClips ?? 0)
}

// Nombre de clips qu'on peut encore produire ce mois-ci (Infinity si illimite).
export function clipRoom(quota: number | null, used: number): number {
  if (quota === null) return Number.POSITIVE_INFINITY
  return Math.max(0, quota - Math.max(0, used))
}

export interface QuotaView { limit: number | null, used: number, remaining: number | null, reached: boolean, resetsAt: string }

export function quotaView(quota: number | null, used: number, now: Date = new Date()): QuotaView {
  const room = clipRoom(quota, used)
  return { limit: quota, used, remaining: Number.isFinite(room) ? room : null, reached: room === 0, resetsAt: nextMonthStart(now).toISOString() }
}

// Plafond saisi par l'admin : entier de 0 a 1000, ou null pour retirer le plafond.
export function parseQuotaInput(value: unknown): { ok: true, value: number | null } | { ok: false } {
  if (value === null) return { ok: true, value: null }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1000) return { ok: true, value }
  return { ok: false }
}
