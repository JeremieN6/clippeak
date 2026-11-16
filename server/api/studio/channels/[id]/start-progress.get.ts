import { prisma } from '../../../../utils/prisma'
import { readEnv } from '../../../../utils/env'
import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'
import { channelQuotaView } from '../../../../utils/clipping/prismaQuota'
import { computeStartProgress, startMessage } from '../../../../utils/clipping/startProgress'
import type { StartVod } from '../../../../utils/clipping/startProgress'
import { detectionCapSec, detectionSecLeft, parseDetectionMode, usesContent } from '../../../../utils/clipping/contentDetection'
import { monthlyDetectionUsageSec } from '../../../../utils/clipping/prismaContentStore'
import { isPayingStatus } from '../../../../utils/clipping/billing'
import { isQuotaExempt } from '../../../../utils/clipping/quota'
import { contentDetectionEnabled } from '../../../../worker/detectionConfig'

// « Demarrage rapide » : ou en est l'analyse des derniers lives du streamer (enregistres a son inscription) et dans combien de temps arrivent ses
// premiers clips. Le delai est une ESTIMATION tenant compte de la file d'attente reelle du serveur (voir startProgress.ts).
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)

  const channel = await prisma.channel.findUnique({
    where: { id },
    select: { twitchId: true, createdAt: true, settings: { select: { detectionMode: true, monthlyClipQuota: true } }, billing: { select: { status: true } } }
  })
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Chaîne introuvable' })

  const rows = await prisma.vod.findMany({
    where: { channelId: id, createdAt: { gte: new Date(Date.now() - 14 * 24 * 3600 * 1000) } },
    orderBy: { createdAt: 'desc' },
    take: 2,
    select: { status: true, title: true, startedAt: true, endedAt: true, createdAt: true, restrictedAt: true, transcript: { select: { transcribedSec: true, doneAt: true } } }
  })

  // La lecture par le contenu est « finie » quand tout est transcrit, ou quand elle ne tournera plus (desactivee, chat seul, plafond d'audio atteint).
  const mode = parseDetectionMode(channel.settings?.detectionMode)
  const cap = detectionCapSec({ paying: isPayingStatus(channel.billing?.status), unlimited: isQuotaExempt(channel.twitchId) || channel.settings?.monthlyClipQuota === null })
  const audioLeft = detectionSecLeft(cap, await monthlyDetectionUsageSec(prisma, id))
  // Sans cle Claude, la detection par le contenu echoue a chaque lecture : on n'annonce pas une attente qui ne finira pas.
  const contentRuns = contentDetectionEnabled() && Boolean(readEnv('ANTHROPIC_API_KEY')) && usesContent(mode) && audioLeft > 0
  const vods: StartVod[] = rows.map(v => ({
    status: v.status,
    durationSec: v.startedAt && v.endedAt ? Math.max(0, (v.endedAt.getTime() - v.startedAt.getTime()) / 1000) : 0,
    title: v.title,
    transcribedSec: v.transcript?.transcribedSec ?? null,
    finished: v.status === 'done' && (!contentRuns || Boolean(v.transcript?.doneAt) || v.createdAt.getTime() < Date.now() - 3 * 24 * 3600 * 1000 || v.restrictedAt !== null)
  }))

  const where = { format: 'short', moment: { vod: { channelId: id } } }
  const [queued, rendering, review, approved, quota] = await Promise.all([
    prisma.clipJob.count({ where: { ...where, status: 'queued' } }),
    prisma.clipJob.count({ where: { ...where, status: 'rendering' } }),
    prisma.clipJob.count({ where: { ...where, status: 'review' } }),
    prisma.clipJob.count({ where: { ...where, status: 'approved' } }),
    channelQuotaView(prisma, id)
  ])

  // File devant cette chaine : lives des autres chaines en attente d'analyse et clips des autres en attente de montage.
  const [vodsAhead, clipsAhead] = await Promise.all([
    prisma.vod.count({ where: { channelId: { not: id }, status: { in: ['ended', 'analyzing'] }, channel: { autoClip: true } } }),
    prisma.clipJob.count({ where: { format: 'short', status: { in: ['queued', 'rendering'] }, moment: { vod: { channelId: { not: id } } } } })
  ])

  const progress = computeStartProgress({ vods, clips: { queued, rendering, ready: review + approved }, queue: { vodsAhead, clipsAhead }, quotaReached: quota.reached })
  // « fresh » : chaine inscrite depuis moins de 7 jours, seule a voir ce bandeau (un ancien streamer a deja ses bandeaux d'analyse habituels).
  return { ...progress, ...startMessage(progress), fresh: Date.now() - channel.createdAt.getTime() < 7 * 24 * 3600 * 1000 }
})
