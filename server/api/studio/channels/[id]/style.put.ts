import { prisma } from '../../../../utils/prisma'
import { parseId, requireStudioAdmin } from '../../../../utils/studioAuth'
import { referencedSoundAssets, styleSchema } from '../../../../utils/clipping/streamerStyle'

export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const id = parseId(getRouterParam(event, 'id'))
  const parsed = styleSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw createError({ statusCode: 400, statusMessage: `${issue?.path.join('.') ?? 'style'} : ${issue?.message ?? 'invalide'}` })
  }

  const channel = await prisma.channel.findUnique({ where: { id }, select: { id: true } })
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Streamer introuvable' })

  // Un fichier reference (SFX, avatar) doit appartenir a ce streamer.
  for (const assetId of [...referencedSoundAssets(parsed.data), parsed.data.overlay.assetId]) {
    if (assetId && !(await prisma.streamerAsset.findFirst({ where: { id: assetId, channelId: id }, select: { id: true } }))) {
      throw createError({ statusCode: 400, statusMessage: 'Fichier inconnu pour ce streamer' })
    }
  }
  await prisma.streamerStyle.upsert({ where: { channelId: id }, update: { config: parsed.data as any }, create: { channelId: id, config: parsed.data as any } })
  return { ok: true }
})
