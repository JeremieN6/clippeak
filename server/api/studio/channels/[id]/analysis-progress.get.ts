import { prisma } from '../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'
import { analysisProgress } from '../../../../utils/clipping/longAnalysis'

// Analyses en cours pour la chaine, affichees en bandeau sur le tableau de bord :
//  - analyzing : Clippeak cherche les meilleurs moments d'une VOD (pas de pourcentage) ;
//  - scanning : lecture de la parole d'un live ou d'une VOD terminee depuis moins de 3 jours (secondes deja lues, pourcentage si la duree est connue) ;
//  - long : analyse d'un live entier pour les extraits longs (« Analyser ce live »).
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000)

  const vods = await prisma.vod.findMany({
    where: {
      channelId: id,
      OR: [{ status: 'analyzing' }, { status: 'live', scanSec: { gt: 0 } }, { status: 'done', scanSec: { gt: 0 }, createdAt: { gte: since } }]
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, title: true, status: true, scanSec: true, startedAt: true, endedAt: true }
  })
  const items: Array<{ id: string, kind: 'analyzing' | 'scanning' | 'long', title: string | null, analyzedSec: number | null, durationSec: number | null, pct: number | null }> = []
  for (const v of vods) {
    const duration = v.status === 'done' && v.startedAt && v.endedAt ? Math.max(0, (v.endedAt.getTime() - v.startedAt.getTime()) / 1000) : null
    if (v.status === 'analyzing') items.push({ id: v.id, kind: 'analyzing', title: v.title, analyzedSec: null, durationSec: null, pct: null })
    else if (v.status === 'live') items.push({ id: v.id, kind: 'scanning', title: v.title, analyzedSec: v.scanSec, durationSec: null, pct: null })
    // VOD terminee : la lecture est finie quand elle a atteint la fin (a 10 secondes pres).
    else if (duration && (v.scanSec ?? 0) < duration - 10) items.push({ id: v.id, kind: 'scanning', title: v.title, analyzedSec: v.scanSec, durationSec: duration, pct: Math.min(99, Math.floor(((v.scanSec ?? 0) / duration) * 100)) })
  }

  const long = await prisma.longAnalysis.findMany({
    where: { channelId: id, status: { in: ['queued', 'running'] } },
    select: { vodId: true, status: true, transcribedSec: true, durationSec: true, vod: { select: { title: true } } }
  })
  for (const a of long) items.push({ id: a.vodId, kind: 'long', title: a.vod.title, analyzedSec: a.transcribedSec, durationSec: a.durationSec, pct: analysisProgress(a.status, a.transcribedSec, a.durationSec) })
  return { items }
})
