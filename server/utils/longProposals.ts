import { prisma } from './prisma'
import { LONG_DEFAULT_MAX_SEC, clampLongMax } from './clipping/longExtract'
import { DEFAULT_END_COMMAND, DEFAULT_START_COMMAND } from './clipping/longMarkers'
import { canUseLongExtracts } from './clipping/longAccess'

// Regles communes aux propositions d'extraits longs cote serveur : les regles pures sont dans ./clipping/longProposalRules.ts.
export * from './clipping/longProposalRules'

// `allowed` : la chaine a droit aux extraits longs (offre Creator, chaine de test ou plafond illimite). `enabled` = allowed ET active : une
// chaine gratuite qui l'avait active avant la reserve n'a plus rien d'actif.
export async function longSettings(channelId: string) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { twitchId: true, billing: { select: { status: true } }, settings: { select: { monthlyClipQuota: true, longExtracts: true, longExtractMaxSec: true, longExtractVerified: true, longStartCommand: true, longEndCommand: true, longModsAllowed: true } } } })
  const settings = channel?.settings
  const allowed = channel ? canUseLongExtracts({ twitchId: channel.twitchId, billingStatus: channel.billing?.status, quotaSetting: settings ? settings.monthlyClipQuota : undefined }) : false
  return {
    allowed,
    enabled: allowed && (settings?.longExtracts ?? false),
    verified: settings?.longExtractVerified ?? false,
    startCommand: settings?.longStartCommand ?? DEFAULT_START_COMMAND,
    endCommand: settings?.longEndCommand ?? DEFAULT_END_COMMAND,
    modsAllowed: settings?.longModsAllowed ?? false,
    maxSec: clampLongMax(settings?.longExtractMaxSec ?? LONG_DEFAULT_MAX_SEC, settings?.longExtractVerified ?? false)
  }
}

