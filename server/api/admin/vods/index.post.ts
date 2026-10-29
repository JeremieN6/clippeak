import { z } from 'zod'
import { prisma } from '../../../utils/prisma'
import { readEnv } from '../../../utils/env'
import { requireStudioAdmin, uuidSchema } from '../../../utils/studioAuth'
import { createTwitchApi, TwitchApiError } from '../../../utils/clipping/twitchApi'
import { parseTwitchVodId } from '../../../utils/clipping/vodUrl'
import { checkVodReadable, RESTRICTED_MESSAGE } from '../../../utils/clipping/vodAccess'
import { isDemoTwitchId } from '../../../utils/demoChannel'

// `simulateRestricted` : essai du parcours « VOD reservee aux abonnes » avec une VOD publique (la VOD d'un ami, par exemple) : elle entre en
// attente comme si Twitch la refusait, puis repart des que le test de lecture reussit (ce qu'il fait tout de suite : elle est publique).
const schema = z.object({ channelId: uuidSchema, url: z.string().max(300), simulateRestricted: z.boolean().optional() })

// Ajout manuel d'une VOD (admin seulement) : une VOD publique, meme d'un autre streamer, est analysee comme une VOD de la chaine
// choisie ; les clips arrivent dans le studio de cette chaine. Sert aux essais en conditions reelles.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Chaîne ou lien invalide' })
  const twitchVodId = parseTwitchVodId(parsed.data.url)
  if (!twitchVodId) throw createError({ statusCode: 400, statusMessage: 'Ce n’est pas un lien de VOD Twitch (exemple : https://www.twitch.tv/videos/123456789)' })

  const channel = await prisma.channel.findUnique({ where: { id: parsed.data.channelId }, select: { id: true, displayName: true, twitchId: true } })
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Chaîne introuvable' })
  if (isDemoTwitchId(channel.twitchId)) throw createError({ statusCode: 400, statusMessage: 'La chaîne de démonstration n’analyse pas de VOD : choisis une vraie chaîne ou une chaîne de test' })

  const known = await prisma.vod.findUnique({ where: { twitchVodId }, select: { status: true, channel: { select: { displayName: true } } } })
  if (known) throw createError({ statusCode: 409, statusMessage: `Cette VOD est déjà connue (chaîne ${known.channel.displayName}, statut ${known.status}). Pour l’essayer sur une autre chaîne, utilise « Déplacer » dans la liste des VODs ajoutées.` })

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
  const access = await checkVodReadable(twitchVodId, fetch, { gql: readEnv('TWITCH_GQL_URL') || undefined, usher: readEnv('TWITCH_USHER_URL') || undefined })
  if (access.state === 'unknown') throw createError({ statusCode: 502, statusMessage: 'Impossible de vérifier que Twitch laisse lire cette VOD. Réessaie dans un instant.' })
  // Reservee aux abonnes : acceptee mais en attente. Le streamer voit « Action requise » et la rend publique le temps de l'analyse.
  const blocked = access.state === 'restricted' || (access.state === 'readable' && parsed.data.simulateRestricted === true)

  const endedAt = new Date(video.createdAt.getTime() + video.durationSec * 1000)
  const vod = await prisma.vod.create({
    data: {
      channelId: channel.id, twitchVodId, url: video.url, title: video.title, source: 'manual', startedAt: video.createdAt, endedAt,
      status: blocked ? 'blocked' : 'ended', restrictedAt: blocked ? new Date() : null, error: blocked ? RESTRICTED_MESSAGE : null
    },
    select: { id: true, status: true }
  })
  return { id: vod.id, status: vod.status, blocked, title: video.title, owner: video.userName, durationSec: video.durationSec, channel: channel.displayName }
})
