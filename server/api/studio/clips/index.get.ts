import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { mediaSecret, requireStudioAdmin } from '../../../utils/studioAuth'
import { signMediaToken } from '../../../utils/clipping/adminAuth'

const statusSchema = z.enum(['queued', 'rendering', 'review', 'approved', 'rejected', 'failed'])
const TOKEN_TTL_MS = 60 * 60 * 1000

// Clips d'un statut donne (a valider par defaut), regroupes par lot de 4 cote client. Les videos sont servies par une URL
// signee a duree limitee : le mot de passe admin ne circule jamais dans une URL.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const status = statusSchema.catch('review').parse(getQuery(event).status)
  const secret = mediaSecret(event)

  const jobs = await prisma.clipJob.findMany({
    where: { status },
    orderBy: [{ batch: 'asc' }, { createdAt: 'asc' }],
    take: 100,
    include: { moment: { include: { vod: { select: { twitchVodId: true, title: true, channel: { select: { displayName: true } } } } } } }
  })

  return {
    clips: jobs.map(job => ({
      id: job.id,
      batch: job.batch,
      status: job.status,
      title: job.title,
      caption: job.caption,
      hashtags: job.hashtags,
      error: job.error,
      qc: job.qc,
      illustrations: job.illustrations,
      reviewNote: job.reviewNote,
      score: job.moment.aiScore,
      kind: job.moment.kind,
      category: job.moment.category,
      hook: job.moment.hook,
      peakSec: job.moment.peakSec,
      channel: job.moment.vod.channel.displayName,
      vodTitle: job.moment.vod.title,
      videoUrl: job.outputPath ? `/api/studio/clips/${job.id}/video?t=${signMediaToken(secret, `clip:${job.id}`, Date.now() + TOKEN_TTL_MS)}` : null
    }))
  }
})
