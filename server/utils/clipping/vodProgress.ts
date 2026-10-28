// Avancement et temps restant estime d'une VOD ajoutee a la main. Ce sont des ESTIMATIONS grossieres, calees sur les mesures du serveur
// (2 coeurs) : l'analyse suit la duree de la VOD, chaque rendu de clip prend quelques dizaines de secondes.
export const RENDER_SEC_PER_CLIP = 30

export function analysisEstimateSec(durationSec: number): number {
  return Math.round(120 + (Math.max(0, durationSec) / 60) * 1.5)
}

export interface JobCounts {
  queued: number
  rendering: number
  review: number
  approved: number
  rejected: number
  failed: number
}

export type VodPhase = 'blocked' | 'waiting' | 'analyzing' | 'rendering' | 'ready' | 'failed'

export interface VodProgress {
  phase: VodPhase
  // Pour l'attente et l'analyse : duree TOTALE de l'analyse ; pour le rendu : temps restant. null = rien a attendre.
  estimateSec: number | null
  clipsTotal: number
  clipsInProgress: number
}

export function vodProgress(status: string, durationSec: number, counts: JobCounts): VodProgress {
  const clipsTotal = counts.queued + counts.rendering + counts.review + counts.approved + counts.rejected + counts.failed
  const clipsInProgress = counts.queued + counts.rendering
  // Reservee aux abonnes : rien ne se passe tant que le streamer ne l'a pas rendue publique.
  if (status === 'blocked') return { phase: 'blocked', estimateSec: null, clipsTotal, clipsInProgress }
  if (status === 'failed') return { phase: 'failed', estimateSec: null, clipsTotal, clipsInProgress }
  if (status === 'ended') return { phase: 'waiting', estimateSec: analysisEstimateSec(durationSec), clipsTotal, clipsInProgress }
  if (status === 'analyzing') return { phase: 'analyzing', estimateSec: analysisEstimateSec(durationSec), clipsTotal, clipsInProgress }
  if (clipsInProgress > 0) return { phase: 'rendering', estimateSec: clipsInProgress * RENDER_SEC_PER_CLIP, clipsTotal, clipsInProgress }
  return { phase: 'ready', estimateSec: null, clipsTotal, clipsInProgress }
}
