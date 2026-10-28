import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { readEnv } from '../../../utils/env'
import { requireStudioAdmin, uuidSchema } from '../../../utils/studioAuth'
import { createTwitchApi, TwitchApiError } from '../../../utils/clipping/twitchApi'
import { parseTwitchVodId } from '../../../utils/clipping/vodUrl'
import { fetchVodMasterPlaylist, VodPlaylistError } from '../../../utils/clipping/vodPlaylist'

const schema = z.object({ channelId: uuidSchema, url: z.string().max(300) })

// Ajout manuel d'une VOD (admin seulement) : une VOD publique, meme d'un autre streamer, est analysee comme une VOD de la chaine
// choisie ; les clips arrivent dans le studio de cette chaine. Sert aux essais en conditions reelles.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Chaîne ou lien invalide' })
  const twitchVodId = parseTwitchVodId(parsed.data.url)
  if (!twitchVodId) throw createError({ statusCode: 400, statusMessage: 'Ce n’est pas un lien de VOD Twitch (exemple : https://www.twitch.tv/videos/123456789)' })

  const channel = await prisma.channel.findUnique({ where: { id: parsed.data.channelId }, select: { id: true, displayName: true, autoClip: true } })
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Chaîne introuvable' })
  if (!channel.autoClip) throw createError({ statusCode: 400, statusMessage: 'La chaîne de démonstration n’analyse pas de VOD : choisis une vraie chaîne' })

  const known = await prisma.vod.findUnique({ where: { twitchVodId }, select: { status: true, channel: { select: { displayName: true } } } })
  if (known) throw createError({ statusCode: 409, statusMessage: `Cette VOD est déjà connue (chaîne ${known.channel.displayName}, statut ${known.status})` })

  const clientId = readEnv('TWITCH_CLIENT_ID')
  const clientSecret = readEnv('TWITCH_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw createError({ statusCode: 503, statusMessage: 'Clés Twitch non configurées' })

  let video
  try {
    video = await createTwitchApi({ clientId, clientSecret, idBase: readEnv('TWITCH_ID_BASE_URL') || undefined, apiBase: readEnv('TWITCH_API_BASE_URL') || undefined }).getVideoById(twitchVodId)
  } catch (error) {
    if (error instanceof TwitchApiError) throw createError({ statusCode: 502, statusMessage: error.message })
    throw error
  }
  if (!video) throw createError({ statusCode: 404, statusMessage: 'VOD introuvable : elle est supprimée ou le lien est faux' })
  if (video.type !== 'archive') throw createError({ statusCode: 400, statusMessage: `Seules les rediffusions de live sont acceptées (celle-ci est de type « ${video.type} »)` })
  // Helix annonce « public » meme pour une VOD d'abonnes : la vraie verification est un essai de lecture, comme le fera le worker.
  if (video.viewable !== 'public') throw createError({ statusCode: 400, statusMessage: 'Cette VOD n’est pas publique : Clippeak ne peut pas la lire' })
  try {
    await fetchVodMasterPlaylist(twitchVodId, fetch, { gql: readEnv('TWITCH_GQL_URL') || undefined, usher: readEnv('TWITCH_USHER_URL') || undefined })
  } catch (error) {
    if (error instanceof VodPlaylistError && error.kind === 'restricted') {
      throw createError({ statusCode: 400, statusMessage: 'Cette VOD est réservée aux abonnés (ou protégée) : Twitch refuse de la lire à Clippeak. Choisis une VOD publique, ou passe-la en public chez Twitch.' })
    }
    throw createError({ statusCode: 502, statusMessage: 'Impossible de vérifier que Twitch laisse lire cette VOD. Réessaie dans un instant.' })
  }

  const endedAt = new Date(video.createdAt.getTime() + video.durationSec * 1000)
  const vod = await prisma.vod.create({
    data: { channelId: channel.id, twitchVodId, url: video.url, title: video.title, status: 'ended', source: 'manual', startedAt: video.createdAt, endedAt },
    select: { id: true, status: true }
  })
  return { id: vod.id, status: vod.status, title: video.title, owner: video.userName, durationSec: video.durationSec, channel: channel.displayName }
})
