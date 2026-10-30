import { unlink } from 'node:fs/promises'
import { prisma } from '../utils/prisma'
import { dataDir, safeResolve } from '../utils/clipping/dataDir'
import { isExpiredRefusedClip, REFUSED_CLIP_RETENTION_DAYS } from '../utils/clipping/retention'

let lastRun = 0

// Duree de conservation : la video d'un clip REFUSE ou EN ECHEC est supprimee apres 14 jours (titre, legende et note restent).
// Les clips a valider, approuves ou publies ne sont jamais touches. Une passe toutes les 6 h ; ne compte pas comme un travail.
export async function retentionStep(): Promise<boolean> {
  if (Date.now() - lastRun < 6 * 3600_000) return false
  lastRun = Date.now()
  const limit = new Date(Date.now() - REFUSED_CLIP_RETENTION_DAYS * 24 * 3600_000)
  const jobs = await prisma.clipJob.findMany({
    where: { status: { in: ['rejected', 'failed'] }, outputPath: { not: null }, updatedAt: { lt: limit } },
    select: { id: true, status: true, outputPath: true, updatedAt: true },
    take: 200
  })
  let removed = 0
  for (const job of jobs) {
    if (!isExpiredRefusedClip(job)) continue
    try { await unlink(safeResolve(dataDir(), job.outputPath as string)) } catch { /* deja absent */ }
    await prisma.clipJob.update({ where: { id: job.id }, data: { outputPath: null } })
    removed++
  }
  if (removed) console.info(`[worker] ${removed} video(s) de clips refuses ou en echec supprimee(s) (plus de ${REFUSED_CLIP_RETENTION_DAYS} jours)`)
  return false
}
