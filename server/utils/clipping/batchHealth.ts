// Ouverture automatique par lots (2026-11-17) : regles pures, sans acces base. Un lot de streamers « se gere bien » quand, parmi ceux qui ont eu le
// temps d'etre traites, presque tous ont recu leur premier clip pret en moins de 24 h, ET que le serveur est reste calme sur la meme periode.
// Tant que ce n'est pas demontre, on n'ouvre rien : le principe reste de garder la maitrise du flux entrant.

import { verdictOf, type Sample } from './capacity.ts'

export const MATURITY_HOURS = 24 // une chaine n'est jugee que 24 h apres l'enregistrement de son premier live
export const CLIP_DEADLINE_HOURS = 24 // premier clip pret au plus 24 h apres
export const MIN_GOOD_SHARE = 0.8 // au moins 80 % des chaines jugees
export const MIN_CALM_SHARE = 0.9 // au moins 90 % des mesures du serveur au verdict « ok »

// Une chaine du lot. `ageHours` : depuis l'enregistrement de son premier live (null = aucun live enregistre, donc rien a decouper : non jugee).
// `firstClipHours` : delai entre ce premier live et son premier clip pret (null = aucun clip pret pour l'instant).
export interface BatchChannel { ageHours: number | null, firstClipHours: number | null }

export type BatchReason = 'ok' | 'too_early' | 'slow_clips' | 'server'

export interface BatchHealth {
  ok: boolean
  reason: BatchReason
  evaluated: number // chaines jugees (live enregistre depuis plus de 24 h)
  good: number // dont premier clip pret en moins de 24 h
  needed: number // chaines jugees necessaires avant de decider
  calmShare: number // part des mesures du serveur « ok » (0 si aucune mesure)
  samples: number
}

export function evaluateBatch(channels: BatchChannel[], samples: Sample[], batchSize: number): BatchHealth {
  const evaluable = channels.filter(c => c.ageHours !== null && c.ageHours >= MATURITY_HOURS)
  const good = evaluable.filter(c => c.firstClipHours !== null && c.firstClipHours <= CLIP_DEADLINE_HOURS).length
  const needed = Math.max(3, Math.ceil(Math.max(1, batchSize) * 0.6))
  const calm = samples.filter(s => verdictOf(s) === 'ok').length
  const calmShare = samples.length ? calm / samples.length : 0
  const base = { evaluated: evaluable.length, good, needed, calmShare, samples: samples.length }
  if (evaluable.length < needed) return { ok: false, reason: 'too_early', ...base }
  if (good / evaluable.length < MIN_GOOD_SHARE) return { ok: false, reason: 'slow_clips', ...base }
  if (calmShare < MIN_CALM_SHARE) return { ok: false, reason: 'server', ...base }
  return { ok: true, reason: 'ok', ...base }
}

// Nouveau plafond d'inscription libre quand l'admin ajoute `add` places : on ajoute aux places LIBRES (jamais un total a se rappeler).
// Si le plafond est deja atteint (ou depasse), on repart du nombre de places prises.
export const openUntilAfterAdd = (openUntil: number, taken: number, add: number): number => Math.max(openUntil, taken) + Math.max(0, Math.floor(add))
