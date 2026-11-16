// Vagues d'invitations et parrainage : regles pures (aucun acces base), partagees par le worker, les routes du site et l'administration.
// Principe : le serveur n'a jamais ete teste sous charge. On invite donc par petites vagues, seulement quand il est au calme, et on garantit
// la place de ceux qui attendent (ordre d'arrivee, les parraines d'abord).

import { verdictOf, type Sample } from './capacity.ts'

export const DEFAULT_DAILY_CAP = 20
// Parrainage (2026-11-16) : le parrain gagne 1 LIVE gratuit de plus pour le mois par personne amenee dont le premier clip est pret ; au plus 5 par mois
// (le reglage admin peut le baisser, jamais le monter). La personne amenee ne recoit rien de plus : elle a deja ses lives gratuits.
export const MAX_BONUS_LIVES = 5
export const DEFAULT_REFERRAL_BONUS_CAP = MAX_BONUS_LIVES
export const REFERRAL_LIVES = 1
// Une vague horaire invite au plus 1/8 du plafond du jour : les arrivees s'etalent au lieu de tomber toutes a la meme heure.
export const WAVES_PER_DAY = 8

// Debut du jour (Europe/Paris), en instant UTC : le plafond d'invitations repart de zero a minuit, heure de Paris.
export function parisDayStart(now: Date = new Date()): Date {
  const zone = 'Europe/Paris'
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).split('-').map(Number)
  const guess = Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!)
  const offsetAt = (t: number) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t))
    const g = (type: string) => Number(p.find(x => x.type === type)!.value)
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - t
  }
  let start = guess - offsetAt(guess)
  start = guess - offsetAt(start) // le decalage peut changer entre minuit UTC et minuit a Paris (changement d'heure)
  return new Date(start)
}

// Le serveur est-il assez calme pour inviter ? Il faut au moins 3 mesures des 10 dernieres minutes, la plus recente de moins de 5 minutes,
// et TOUTES au verdict « ok » : un seul « attention » ou « sature » arrete la vague.
export function serverAllowsWave(samples: Array<Sample & { at: Date }>, now: Date = new Date()): boolean {
  const recent = samples.filter(s => now.getTime() - s.at.getTime() <= 10 * 60_000)
  if (recent.length < 3) return false
  if (!recent.some(s => now.getTime() - s.at.getTime() <= 5 * 60_000)) return false
  return recent.every(s => verdictOf(s) === 'ok')
}

export interface WaveInput { enabled: boolean, dailyCap: number, invitedToday: number, serverOk: boolean, queueLength: number }

// Combien d'invitations lancer maintenant : 0 si les vagues sont coupees, si le serveur n'est pas calme ou si le plafond du jour est atteint.
export function waveSize(input: WaveInput): number {
  if (!input.enabled || !input.serverOk) return 0
  const remaining = Math.max(0, Math.floor(input.dailyCap) - input.invitedToday)
  const step = Math.max(1, Math.ceil(input.dailyCap / WAVES_PER_DAY))
  return Math.max(0, Math.min(remaining, step, input.queueLength))
}

export interface QueueItem { createdAt: Date, referred: boolean }

// Ordre de la file : les parraines d'abord, puis l'ordre d'arrivee (le plus ancien en premier). Le tri est stable.
export function orderQueue<T extends QueueItem>(items: T[]): T[] {
  return items.map((item, index) => ({ item, index })).sort((a, b) =>
    Number(b.item.referred) - Number(a.item.referred) || a.item.createdAt.getTime() - b.item.createdAt.getTime() || a.index - b.index).map(x => x.item)
}

// Etat affiche sur la page d'attente. On ne promet jamais d'heure.
export type WaitState = 'manual' | 'day_full' | 'next_wave'
export function waitState(input: { enabled: boolean, dailyCap: number, invitedToday: number }): WaitState {
  if (!input.enabled) return 'manual'
  return input.invitedToday >= input.dailyCap ? 'day_full' : 'next_wave'
}

// Parrainage ----------------------------------------------------------------------------------------------------------------------------

export const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const REFERRAL_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/
export const isReferralCode = (value: unknown): value is string => typeof value === 'string' && REFERRAL_CODE_PATTERN.test(value)

const isTestChannel = (twitchId: string) => twitchId === 'demo-clippeak' || twitchId.startsWith('test-')

// Faux parrainages : un parrainage ne compte que si les deux chaines sont reelles et differentes.
export function referralAllowed(input: { channelId: string, channelTwitchId: string, referrerId: string, referrerTwitchId: string }): boolean {
  if (input.channelId === input.referrerId || input.channelTwitchId === input.referrerTwitchId) return false
  return !isTestChannel(input.channelTwitchId) && !isTestChannel(input.referrerTwitchId)
}

// Lives bonus du mois = parrainages actives ce mois-ci, au plus le plafond mensuel de bonus (et jamais plus de MAX_BONUS_LIVES).
export const bonusLives = (granted: number, cap: number): number => Math.max(0, Math.min(Math.floor(granted), Math.max(0, Math.floor(cap)), MAX_BONUS_LIVES))
