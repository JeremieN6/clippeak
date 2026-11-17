import type { Box, FaceHit } from './framingDetect.ts'

// Suivi du visage : le cadre vertical reste fixe tant que le streamer bouge peu, et glisse tres doucement quand il s'eloigne du centre.
// Regles de confort (rien de saccade, jamais d'effet « camera qui cherche ») :
//  - zone morte : on ne bouge pas tant que le visage reste dans le tiers central du cadre ;
//  - mouvement unique, lent, en « S » (demarrage et arret progressifs), jamais de ligne brisee ;
//  - le mouvement commence AVANT que le visage atteigne le bord (le trajet est calcule apres coup, on connait la suite) ;
//  - au plus 5 mouvements par clip, jamais deux de suite sans pause, et pas de mouvement minuscule ;
//  - le zoom ne change jamais pendant le clip, la hauteur non plus.
export interface PanMove {
  // Debut du mouvement et duree (secondes), centre vise (0..1 de la largeur de la source).
  at: number
  dur: number
  to: number
}

export interface TrackOptions {
  // Largeur / hauteur de la source (16/9 par defaut).
  sourceAspect?: number
  // Zoom d'ouverture (0,12 = 12 %).
  introAmount?: number
  minHits?: number
  targetFaceShare?: number
  maxZoom?: number
}

export interface TrackPlan {
  zoom: number
  // Centre de depart, hauteur fixe, mouvements, et zone du streamer sur tout le clip.
  centerX: number
  centerY: number
  moves: PanMove[]
  face: Box
}

export const MAX_MOVES = 5
const DEAD_ZONE = 0.18 // part de la largeur du cadre, de chaque cote du centre
const MIN_MOVE = 0.12 // part de la largeur du cadre : en dessous, on ne bouge pas
const MIN_DURATION = 1.4
const MAX_DURATION = 4
const MAX_SPEED = 0.25 // largeur de cadre par seconde (vitesse moyenne)
const PAUSE = 0.4

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const round = (n: number, digits = 3) => Math.round(n * 10 ** digits) / 10 ** digits

// Demarrage et arret progressifs : derivee nulle aux deux bouts, donc aucun a-coup.
export const smoothstep = (u: number) => { const x = clamp(u, 0, 1); return x * x * (3 - 2 * x) }

// Position du centre du cadre a l'instant t.
export function panAt(startX: number, moves: PanMove[], t: number): number {
  let x = startX
  let from = startX
  for (const move of moves) {
    x += (move.to - from) * smoothstep((t - move.at) / move.dur)
    from = move.to
  }
  return x
}

export type TimedHit = FaceHit & { t: number }

// Trajet du cadre a partir des positions du visage relevees dans le clip. Renvoie null si le streamer n'est pas reconnu assez souvent.
export function planTrack(hits: TimedHit[], startSec: number, options: TrackOptions = {}): TrackPlan | null {
  const minHits = options.minHits ?? 2
  const found = hits.filter((h): h is TimedHit & { box: Box } => h.found && !!h.box).sort((a, b) => a.t - b.t)
  if (found.length < minHits) return null
  const aspect = options.sourceAspect ?? 16 / 9
  const intro = 1 + Math.max(0, options.introAmount ?? 0)

  // Images aberrantes (autre personne, fausse detection) : loin de la position habituelle.
  const mx = median(found.map(h => h.box.x + h.box.w / 2))
  const my = median(found.map(h => h.box.y + h.box.h / 2))
  const kept = found.filter(h => Math.abs(h.box.x + h.box.w / 2 - mx) <= 0.3 && Math.abs(h.box.y + h.box.h / 2 - my) <= 0.25)
  const cluster = kept.length >= minHits ? kept : found

  // Hauteur fixe : elle contient le visage et un peu d'epaules sur toutes les images.
  const y0 = Math.min(...cluster.map(h => h.box.y - h.box.h * 0.5))
  const y1 = Math.max(...cluster.map(h => h.box.y + h.box.h * 1.5))
  const faceH = median(cluster.map(h => h.box.h))
  const maxBoxW = Math.max(...cluster.map(h => h.box.w))

  // Zoom : visage assez grand, mais la largeur du cadre doit laisser la zone morte, le visage et une marge pour le mouvement.
  const wanted = clamp((options.targetFaceShare ?? 0.24) / Math.max(faceH, 0.01), 1, options.maxZoom ?? 2)
  const needW = (maxBoxW * 1.8 + 0.08) / (1 - 2 * DEAD_ZONE)
  const fitX = (9 / 16 / aspect) / (needW * intro)
  const fitY = 1 / (Math.max(y1 - y0, 0.01) * intro)
  const zoom = Math.max(1, Math.min(wanted, fitX, fitY))
  const cropW = Math.min(1, 9 / 16 / aspect / zoom)
  const half = cropW / 2
  const lo = half
  const hi = 1 - half
  const centres = cluster.map(h => ({ t: h.t, c: h.box.x + h.box.w / 2 }))

  // Depart : la ou est le streamer au debut du clip (pas de mouvement a l'ouverture).
  const startX = clamp(median(centres.slice(0, 3).map(p => p.c)), lo, hi)
  const moves: PanMove[] = []
  let cam = startX
  let lastEnd = -Infinity
  for (let i = 0; i < centres.length && moves.length < MAX_MOVES; i++) {
    const { t, c } = centres[i]
    const now = panAt(startX, moves, t)
    if (Math.abs(c - now) <= DEAD_ZONE * cropW) continue
    // Vise la position stable des images suivantes (lisse le bruit de detection).
    const target = clamp(median(centres.slice(i, i + 3).map(p => p.c)), lo, hi)
    if (Math.abs(target - cam) < MIN_MOVE * cropW) continue
    const dist = Math.abs(target - cam)
    const dur = clamp(1.5 * dist / (MAX_SPEED * cropW), MIN_DURATION, MAX_DURATION)
    const at = Math.max(lastEnd + PAUSE, t - dur * 0.7, startSec)
    moves.push({ at: round(at), dur: round(dur), to: round(target) })
    lastEnd = at + dur
    cam = target
  }

  return {
    zoom: round(zoom, 2),
    centerX: round(startX),
    centerY: round(clamp((y0 + y1) / 2 + 0.1 / zoom, 0, 1)),
    moves,
    face: (() => {
      const fx0 = clamp(Math.min(...cluster.map(h => h.box.x - h.box.w * 0.9)), 0, 1)
      const fx1 = clamp(Math.max(...cluster.map(h => h.box.x + h.box.w * 1.9)), 0, 1)
      return { x: round(fx0), y: round(clamp(y0, 0, 1)), w: round(fx1 - fx0), h: round(clamp(y1, 0, 1) - clamp(y0, 0, 1)) }
    })()
  }
}
