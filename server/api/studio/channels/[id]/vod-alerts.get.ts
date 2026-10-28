import { prisma } from '../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'

// VODs de la chaine qui demandent l'attention du streamer. Seules celles qui ont ete reservees aux abonnes sont concernees :
//  - blocked : Twitch refuse de la lire, il doit la rendre publique ;
//  - working : elle est lisible, Clippeak recupere ses extraits (il doit la laisser publique) ;
//  - restore : les extraits sont enregistres, il peut la remettre comme avant (jusqu'a ce qu'il confirme).
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const rows = await prisma.vod.findMany({
    where: {
      channelId: id,
      restrictedAt: { not: null },
      OR: [
        { status: 'blocked' },
        { sourcesSavedAt: null, status: { in: ['ended', 'analyzing'] } },
        { sourcesSavedAt: { not: null }, restoreAckAt: null }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, title: true, twitchVodId: true, status: true, sourcesSavedAt: true, restrictedAt: true }
  })
  // Ce qui demande une action d'abord.
  const order = { blocked: 0, restore: 1, working: 2 } as const
  return {
    alerts: rows.map(v => ({
      id: v.id,
      title: v.title || `VOD ${v.twitchVodId}`,
      state: v.status === 'blocked' ? 'blocked' as const : v.sourcesSavedAt ? 'restore' as const : 'working' as const,
      since: v.restrictedAt
    })).sort((a, b) => order[a.state] - order[b.state])
  }
})
