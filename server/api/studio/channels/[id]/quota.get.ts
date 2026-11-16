import { prisma } from '../../../../utils/prisma'
import { assertChannel, parseId, requireStudioActor } from '../../../../utils/studioAuth'
import { channelQuotaView } from '../../../../utils/clipping/prismaQuota'

// Plafond mensuel de clips de la chaine : limite (null = illimite), clips produits ce mois-ci, date de remise a zero.
export default defineEventHandler(async (event) => {
  const actor = await requireStudioActor(event)
  const id = parseId(getRouterParam(event, 'id'))
  assertChannel(actor, id)
  // Lives qui attendent la remise a zero du plafond (analyse pas encore commencee) : montres dans le message de limite.
  const [view, waitingVods] = await Promise.all([channelQuotaView(prisma, id), prisma.vod.count({ where: { channelId: id, status: 'ended' } })])
  return { ...view, waitingVods }
})
