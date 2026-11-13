import { prisma } from './prisma'
import { LONG_DEFAULT_MAX_SEC, clampLongMax } from './clipping/longExtract'

// Regles communes aux propositions d'extraits longs cote serveur : les regles pures sont dans ./clipping/longProposalRules.ts.
export * from './clipping/longProposalRules'

export async function longSettings(channelId: string) {
  const settings = await prisma.streamerSettings.findUnique({ where: { channelId }, select: { longExtracts: true, longExtractMaxSec: true, longExtractVerified: true } })
  return {
    enabled: settings?.longExtracts ?? false,
    verified: settings?.longExtractVerified ?? false,
    maxSec: clampLongMax(settings?.longExtractMaxSec ?? LONG_DEFAULT_MAX_SEC, settings?.longExtractVerified ?? false)
  }
}

