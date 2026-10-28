import { z } from 'zod'
import { prisma } from '../../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor } from '../../../../../utils/studioAuth'
import { tokenKey } from '../../../../../utils/publishConfig'
import { decryptToken } from '../../../../../utils/clipping/tokenVault'
import { revokeGoogleToken } from '../../../../../utils/clipping/googleOAuth'
import { PUBLISH_PLATFORMS } from '../../../../../utils/clipping/publishing'

// Deconnecte une plateforme : l'autorisation est retiree chez Google (au mieux), les jetons sont effaces chez nous et les
// publications encore programmees sur cette plateforme sont annulees.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  const platform = z.enum(PUBLISH_PLATFORMS).safeParse(getRouterParam(event, 'platform'))
  if (!platform.success) throw createError({ statusCode: 404, statusMessage: 'Plateforme inconnue' })

  const connection = await prisma.platformConnection.findUnique({ where: { channelId_platform: { channelId: id, platform: platform.data } } })
  if (!connection) throw createError({ statusCode: 404, statusMessage: 'Compte non connecté' })

  const key = tokenKey()
  if (key && connection.refreshTokenEnc) {
    try { await revokeGoogleToken(fetch, decryptToken(connection.refreshTokenEnc, key)) } catch { /* jeton illisible : on supprime quand meme */ }
  }
  await prisma.publication.updateMany({
    where: { platform: platform.data, status: 'scheduled', clipJob: { moment: { vod: { channelId: id } } } },
    data: { status: 'cancelled', error: 'Compte déconnecté.' }
  })
  await prisma.platformConnection.delete({ where: { id: connection.id } })
  return { ok: true }
})
