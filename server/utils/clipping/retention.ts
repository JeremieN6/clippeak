// Duree de conservation des videos de clips refuses ou en echec (regle pure, testee).
export const REFUSED_CLIP_RETENTION_DAYS = 14

export function isExpiredRefusedClip(job: { status: string, outputPath: string | null, updatedAt: Date }, now = new Date()): boolean {
  if (!job.outputPath) return false
  if (job.status !== 'rejected' && job.status !== 'failed') return false
  return now.getTime() - job.updatedAt.getTime() >= REFUSED_CLIP_RETENTION_DAYS * 24 * 3600_000
}
