import { prisma } from './prisma'
import { LONG_DEFAULT_MAX_SEC, clampLongMax } from './clipping/longExtract'
import { DEFAULT_END_COMMAND, DEFAULT_START_COMMAND } from './clipping/longMarkers'

// Regles communes aux propositions d'extraits longs cote serveur : les regles pures sont dans ./clipping/longProposalRules.ts.
export * from './clipping/longProposalRules'

export async function longSettings(channelId: string) {
  const settings = await prisma.streamerSettings.findUnique({ where: { channelId }, select: { longExtracts: true, longExtractMaxSec: true, longExtractVerified: true, longStartCommand: true, longEndCommand: true, longModsAllowed: true } })
  return {
    enabled: settings?.longExtracts ?? false,
    verified: settings?.longExtractVerified ?? false,
    startCommand: settings?.longStartCommand ?? DEFAULT_START_COMMAND,
    endCommand: settings?.longEndCommand ?? DEFAULT_END_COMMAND,
    modsAllowed: settings?.longModsAllowed ?? false,
    maxSec: clampLongMax(settings?.longExtractMaxSec ?? LONG_DEFAULT_MAX_SEC, settings?.longExtractVerified ?? false)
  }
}

