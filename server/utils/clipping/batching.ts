export const BATCH_SIZE = 4

export interface BatchCandidate {
  id: string
  // Note du moment (sur 10) : les meilleurs clips partent dans les premiers lots.
  score: number
}

export interface BatchAssignment {
  id: string
  batch: number
  // false pour le dernier lot s'il compte moins de BATCH_SIZE clips.
  complete: boolean
}

// Repartit des clips en lots de 4, les mieux notes d'abord. Les numeros continuent apres le dernier lot existant.
export function assignBatches(items: BatchCandidate[], lastBatchNumber = 0, size = BATCH_SIZE): BatchAssignment[] {
  const sorted = [...items].sort((a, b) => b.score - a.score)
  return sorted.map((item, index) => {
    const batchIndex = Math.floor(index / size)
    const inBatch = Math.min(size, sorted.length - batchIndex * size)
    return { id: item.id, batch: lastBatchNumber + batchIndex + 1, complete: inBatch === size }
  })
}

export type BatchJobStatus = 'queued' | 'rendering' | 'review' | 'approved' | 'rejected' | 'failed'

// Un lot est pret a etre envoye pour validation quand plus aucun de ses clips n'est en attente ou en cours de rendu
// et qu'au moins un clip est a valider.
export function isBatchReadyForReview(statuses: BatchJobStatus[]): boolean {
  if (!statuses.length) return false
  if (statuses.some(s => s === 'queued' || s === 'rendering')) return false
  return statuses.some(s => s === 'review')
}
