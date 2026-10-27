import { readEnv } from '../../../../utils/env'
import { prisma } from '../../../../utils/prisma'
import { parseId, assertChannel, requireStudioActor } from '../../../../utils/studioAuth'
import { createTwitchApi, TwitchApiError } from '../../../../utils/clipping/twitchApi'
import { toReferenceClips } from '../../../../utils/clipping/referenceClips'

// Rafraichit la banque de clips de reference d'un streamer (API Twitch Clips : vues, categories).
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const channel = await prisma.channel.findUnique({ where: { id } })
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Streamer introuvable' })

  try {
    const api = createTwitchApi({ clientId: readEnv('TWITCH_CLIENT_ID'), clientSecret: readEnv('TWITCH_CLIENT_SECRET') })
    const clips = await api.listClips(channel.twitchId, 100)
    const names = await api.getGameNames(clips.map(c => c.gameId ?? ''))
    const reference = toReferenceClips(clips, names)
    for (const clip of reference) {
      await prisma.referenceClip.upsert({
        where: { twitchClipId: clip.id },
        update: { title: clip.title.slice(0, 255), viewCount: clip.viewCount, category: clip.category.slice(0, 100), fetchedAt: new Date() },
        create: { channelId: id, twitchClipId: clip.id, title: clip.title.slice(0, 255), viewCount: clip.viewCount, durationSec: clip.durationSec, category: clip.category.slice(0, 100) }
      })
    }
    return { clips: reference.length }
  } catch (error) {
    if (error instanceof TwitchApiError) throw createError({ statusCode: 502, statusMessage: error.message })
    throw error
  }
})
