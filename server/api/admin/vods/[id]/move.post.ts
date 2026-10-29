import { z } from 'zod'
import { prisma } from '../../../../utils/prisma'
import { isDemoTwitchId } from '../../../../utils/demoChannel'
import { parseId, requireStudioAdmin, uuidSchema } from '../../../../utils/studioAuth'

const schema = z.object({ channelId: uuidSchema })

// Deplace une VOD ajoutee a la main (avec ses moments et ses clips) vers une autre chaine : pour essayer la meme VOD avec un autre
// style ou d'autres photos (une VOD ne peut appartenir qu'a une chaine). Les clips deja rendus gardent leur video ; les refaire
// utilise le style et les photos de la nouvelle chaine.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const id = parseId(getRouterParam(event, 'id'))
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Chaîne invalide' })
  const vod = await prisma.vod.findUnique({ where: { id }, select: { source: true, status: true, channelId: true } })
  if (!vod || vod.source !== 'manual') throw createError({ statusCode: 404, statusMessage: 'VOD introuvable' })
  if (vod.status === 'analyzing') throw createError({ statusCode: 409, statusMessage: 'Analyse en cours : attends la fin avant de déplacer cette VOD' })
  if (vod.channelId === parsed.data.channelId) throw createError({ statusCode: 400, statusMessage: 'Cette VOD est déjà sur cette chaîne' })
  const target = await prisma.channel.findUnique({ where: { id: parsed.data.channelId }, select: { id: true, twitchId: true } })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Chaîne introuvable' })
  if (isDemoTwitchId(target.twitchId)) throw createError({ statusCode: 400, statusMessage: 'La chaîne de démonstration n’analyse pas de VOD' })
  // Une publication programmee part avec le compte de la chaine d'origine : on ne deplace pas une VOD qui en a.
  const pending = await prisma.publication.count({ where: { status: { in: ['scheduled', 'publishing'] }, clipJob: { moment: { vodId: id } } } })
  if (pending) throw createError({ statusCode: 409, statusMessage: 'Des publications sont programmées pour les clips de cette VOD : annule-les avant de la déplacer' })
  await prisma.vod.update({ where: { id }, data: { channelId: target.id } })
  return { ok: true }
})
