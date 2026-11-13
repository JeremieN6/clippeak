import { z } from 'zod'
import { prisma } from '../../../../utils/prisma'
import { readEnv } from '../../../../utils/env'
import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'
import { createTwitchApi, TwitchApiError } from '../../../../utils/clipping/twitchApi'
import { parseTwitchVodId } from '../../../../utils/clipping/vodUrl'
import { checkVodReadable, RESTRICTED_MESSAGE } from '../../../../utils/clipping/vodAccess'
import { isDemoTwitchId } from '../../../../utils/demoChannel'

const schema = z.object({ url: z.string().max(300) })
const MAX_PER_DAY = 3

// « Analyser une VOD » : le streamer ajoute une ancienne rediffusion DE SA CHAINE ; Clippeak l'analyse comme un live terminé et les clips
// arrivent dans son tableau de bord. Une VOD d'une autre chaine est refusee. Une seule VOD ajoutee a la fois, trois par jour : une analyse
// occupe longtemps le serveur.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Colle le lien de ta VOD Twitch.' })
  const twitchVodId = parseTwitchVodId(parsed.data.url)
  if (!twitchVodId) throw createError({ statusCode: 400, statusMessage: 'Ce n’est pas un lien de VOD Twitch (exemple : https://www.twitch.tv/videos/123456789).' })

  const channel = await prisma.channel.findUnique({ where: { id }, select: { id: true, login: true, twitchId: true } })
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Streamer introuvable' })
  if (isDemoTwitchId(channel.twitchId)) throw createError({ statusCode: 400, statusMessage: 'La chaîne de démonstration n’analyse pas de VOD.' })

  const known = await prisma.vod.findUnique({ where: { twitchVodId }, select: { channelId: true, status: true } })
  if (known) throw createError({ statusCode: 409, statusMessage: known.channelId === id ? 'Cette VOD est déjà dans ton espace : Clippeak l’a déjà analysée ou l’analyse.' : 'Cette VOD est déjà connue de Clippeak.' })

  const pending = await prisma.vod.count({ where: { channelId: id, source: 'manual', status: { in: ['ended', 'analyzing'] } } })
  if (pending) throw createError({ statusCode: 409, statusMessage: 'Une VOD est déjà en cours d’analyse : attends qu’elle soit terminée.' })
  const today = await prisma.vod.count({ where: { channelId: id, source: 'manual', createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } })
  if (today >= MAX_PER_DAY) throw createError({ statusCode: 429, statusMessage: `Tu as déjà ajouté ${MAX_PER_DAY} VODs aujourd’hui. Réessaie demain.` })

  const clientId = readEnv('TWITCH_CLIENT_ID')
  const clientSecret = readEnv('TWITCH_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw createError({ statusCode: 503, statusMessage: 'Twitch n’est pas disponible pour le moment. Réessaie plus tard.' })

  let video
  try {
    video = await createTwitchApi({ clientId, clientSecret, idBase: readEnv('TWITCH_ID_BASE_URL') || undefined, apiBase: readEnv('TWITCH_API_BASE_URL') || undefined }).getVideoById(twitchVodId)
  } catch (error) {
    if (error instanceof TwitchApiError) throw createError({ statusCode: 502, statusMessage: 'Twitch ne répond pas pour le moment. Réessaie dans quelques minutes.' })
    throw error
  }
  if (!video) throw createError({ statusCode: 404, statusMessage: 'VOD introuvable : elle est supprimée ou le lien est faux.' })
  // La VOD doit etre celle de CETTE chaine : l'identifiant Twitch si Twitch le donne, sinon le pseudo.
  const mine = video.userId ? video.userId === channel.twitchId : video.userLogin.toLowerCase() === channel.login.toLowerCase()
  if (!mine) throw createError({ statusCode: 403, statusMessage: 'Cette VOD n’est pas celle de ta chaîne : tu ne peux analyser que tes propres rediffusions.' })
  if (video.type !== 'archive') throw createError({ statusCode: 400, statusMessage: 'Seules les rediffusions de live sont acceptées (pas les extraits ni les highlights).' })
  if (video.viewable !== 'public') throw createError({ statusCode: 400, statusMessage: 'Cette VOD n’est pas publique : Clippeak ne peut pas la lire. Rends-la publique sur Twitch, puis réessaie.' })
  const access = await checkVodReadable(twitchVodId, fetch, { gql: readEnv('TWITCH_GQL_URL') || undefined, usher: readEnv('TWITCH_USHER_URL') || undefined })
  if (access.state === 'unknown') throw createError({ statusCode: 502, statusMessage: 'Impossible de vérifier que Twitch laisse lire cette VOD. Réessaie dans un instant.' })
  // Reservee aux abonnes : acceptee mais en attente ; la carte « Action requise » explique quoi faire.
  const blocked = access.state === 'restricted'

  const endedAt = new Date(video.createdAt.getTime() + video.durationSec * 1000)
  const vod = await prisma.vod.create({
    data: {
      channelId: id, twitchVodId, url: video.url, title: video.title, source: 'manual', startedAt: video.createdAt, endedAt,
      status: blocked ? 'blocked' : 'ended', restrictedAt: blocked ? new Date() : null, error: blocked ? RESTRICTED_MESSAGE : null
    },
    select: { id: true, status: true }
  })
  return { id: vod.id, status: vod.status, blocked, title: video.title, durationSec: video.durationSec }
})
