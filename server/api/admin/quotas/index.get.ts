import { prisma } from '../../../utils/prisma'
import { requireStudioAdmin } from '../../../utils/studioAuth'
import { channelQuotaView } from '../../../utils/clipping/prismaQuota'
import { isQuotaExempt } from '../../../utils/clipping/quota'

// Plafond et usage du mois pour chaque vraie chaine (admin seulement ; les chaines de demonstration et de test ne sont jamais plafonnees).
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const channels = await prisma.channel.findMany({ select: { id: true, twitchId: true } })
  const quotas: Record<string, Awaited<ReturnType<typeof channelQuotaView>>> = {}
  for (const c of channels) if (!isQuotaExempt(c.twitchId)) quotas[c.id] = await channelQuotaView(prisma, c.id)
  return { quotas }
})
