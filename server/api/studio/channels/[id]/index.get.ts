import { prisma } from '../../../../utils/prisma'
import { parseId, requireStudioAdmin } from '../../../../utils/studioAuth'
import { parseStyle } from '../../../../utils/clipping/streamerStyle'
import { BUILTIN_SOUNDS, SOUND_SITUATIONS } from '../../../../utils/clipping/sounds'
import { buildReferenceProfile } from '../../../../utils/clipping/referenceClips'

// Reglages, DA, fichiers (sans chemins serveur) et resume de la banque de reference d'un streamer.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const id = parseId(getRouterParam(event, 'id'))
  const channel = await prisma.channel.findUnique({
    where: { id },
    include: { settings: true, style: true, assets: { orderBy: { createdAt: 'desc' } }, referenceClips: true }
  })
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Streamer introuvable' })

  const profile = buildReferenceProfile(channel.referenceClips.map(c => ({
    id: c.twitchClipId, title: c.title, viewCount: c.viewCount, durationSec: c.durationSec, category: c.category
  })))
  return {
    channel: { id: channel.id, login: channel.login, displayName: channel.displayName, autoClip: channel.autoClip },
    settings: channel.settings && {
      keywords: channel.settings.keywords,
      clipMinSec: channel.settings.clipMinSec,
      clipMaxSec: channel.settings.clipMaxSec,
      subtitles: channel.settings.subtitles,
      accentColor: channel.settings.accentColor,
      highlightColor: channel.settings.highlightColor
    },
    style: parseStyle(channel.style?.config),
    // Bruitages proposes dans la DA : sons integres et situations ou ils peuvent etre joues.
    sounds: { builtin: BUILTIN_SOUNDS, situations: SOUND_SITUATIONS },
    assets: channel.assets.map(a => ({ id: a.id, kind: a.kind, filename: a.filename, tags: a.tags, source: a.source, createdAt: a.createdAt })),
    reference: { clipCount: profile.clipCount, medianViews: profile.medianViews, topics: profile.topics.slice(0, 12), categories: profile.categories.slice(0, 8) }
  }
})
