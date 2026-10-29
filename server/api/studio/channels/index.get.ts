import { prisma } from '../../../utils/prisma'
import { isDemoTwitchId, isTestTwitchId } from '../../../utils/demoChannel'
import { requireStudioActor } from '../../../utils/studioAuth'

export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const rows = await prisma.channel.findMany({ where: actor.admin ? {} : { id: actor.channelId ?? '' }, orderBy: { createdAt: 'asc' }, select: { id: true, twitchId: true, login: true, displayName: true, autoClip: true } })
  // `demo` : la chaine de demonstration de l'admin (jamais un vrai streamer).
  return { channels: rows.map(({ twitchId, ...c }) => ({ ...c, demo: isDemoTwitchId(twitchId), test: isTestTwitchId(twitchId) })) }
})
