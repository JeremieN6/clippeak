import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { mediaSecret, requireStudioActor } from '../../../utils/studioAuth'
import { signMediaToken } from '../../../utils/clipping/adminAuth'
import { clipOrigin } from '../../../utils/clipping/clipOrigin'

const statusSchema = z.enum(['queued', 'rendering', 'review', 'approved', 'rejected', 'failed'])
const TOKEN_TTL_MS = 60 * 60 * 1000

// Clips d'un statut donne (a valider par defaut) ou de tous les statuts (`status=all`, tableau de bord), regroupes par lot
// de 4 cote client. Les videos sont servies par une URL signee a duree limitee : le mot de passe admin ne circule jamais dans une URL.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const raw = getQuery(event).status
  const status = raw === 'all' ? undefined : statusSchema.catch('review').parse(raw)
  const secret = mediaSecret(event)

  const jobs = await prisma.clipJob.findMany({
    where: { ...(status ? { status } : {}), ...(actor.admin ? {} : { moment: { vod: { channelId: actor.channelId ?? '' } } }) },
    orderBy: [{ batch: 'desc' }, { createdAt: 'asc' }],
    take: status ? 100 : 300,
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
      rationale: job.moment.rationale,
      scorer: job.moment.scorer,
      kind: job.moment.kind,
      category: job.moment.category,
      hook: job.moment.hook,
      peakSec: job.moment.peakSec,
      origin: clipOrigin(job.moment.rationale),
      createdAt: job.createdAt,
      durationSec: job.startSec != null && job.endSec != null ? Math.round(job.endSec - job.startSec) : null,
      channel: job.moment.vod.channel.displayName,
      vodTitle: job.moment.vod.title,
      videoUrl: job.outputPath ? `/api/studio/clips/${job.id}/video?t=${signMediaToken(secret, `clip:${job.id}`, Date.now() + TOKEN_TTL_MS)}` : null
    }))
  }
})
