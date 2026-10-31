import { prisma } from './prisma'
import { readEnv } from './env'
import { tokenKey } from './publishConfig'
import { decryptToken } from './clipping/tokenVault'
import { revokeGoogleToken } from './clipping/googleOAuth'
import { createTwitchApi } from './clipping/twitchApi'
import { eraseChannel, isDemoTwitchId, isTestTwitchId } from './demoChannel'
import { stripeClient } from './billingConfig'

// Export et suppression des donnees d'un streamer (RGPD : acces et effacement). L'export ne contient JAMAIS de jeton ni de mot de passe.

export async function exportChannelData(channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      settings: true,
      style: true,
      assets: { select: { kind: true, filename: true, tags: true, source: true, createdAt: true } },
      referenceItems: { select: { kind: true, source: true, url: true, title: true, durationSec: true, status: true, transcript: true, analysis: true, createdAt: true } },
      connections: { select: { platform: true, accountName: true, createdAt: true } },
      vods: {
        select: {
          twitchVodId: true, url: true, title: true, status: true, startedAt: true, endedAt: true, createdAt: true,
          moments: { select: { startSec: true, endSec: true, score: true, hook: true, category: true, rationale: true, transcript: true, createdAt: true, jobs: { select: { title: true, caption: true, hashtags: true, status: true, batch: true, reviewNote: true, createdAt: true, publications: { select: { platform: true, status: true, scheduledAt: true, publishedAt: true, externalUrl: true } } } } } }
        }
      },
      roadmapVotes: { select: { createdAt: true, feature: { select: { title: true } } } },
      roadmapIdeas: { select: { text: true, status: true, createdAt: true } },
      notifications: { select: { title: true, body: true, createdAt: true, readAt: true } },
      billing: { select: { plan: true, status: true, currentPeriodEnd: true, createdAt: true } }
    }
  })
  if (!channel) return null
  return {
    exportedAt: new Date().toISOString(),
    note: 'Export de tes données Clippeak. Les fichiers (photos, vidéos, clips) ne sont pas inclus ici : écris à contact.clippeak@sassify.fr pour les recevoir.',
    channel: { login: channel.login, displayName: channel.displayName, createdAt: channel.createdAt },
    settings: channel.settings,
    style: channel.style?.config ?? null,
    files: channel.assets,
    referenceClips: channel.referenceItems,
    connections: channel.connections,
    vods: channel.vods,
    votes: channel.roadmapVotes.map(v => ({ feature: v.feature.title, at: v.createdAt })),
    ideas: channel.roadmapIdeas,
    notifications: channel.notifications,
    subscription: channel.billing
  }
}

export type DeleteResult = { ok: true, steps: string[] } | { ok: false, reason: 'not_found' | 'protected' }

// Supprime le compte : autorisations des plateformes retirees (au mieux), ecoutes Twitch retirees (au mieux), puis base et fichiers,
// puis l'invitation (aucune donnee personnelle ne reste ; pour revenir il faut etre invite de nouveau).
export async function deleteChannelAccount(channelId: string): Promise<DeleteResult> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId }, include: { connections: true } })
  if (!channel) return { ok: false, reason: 'not_found' }
  if (isDemoTwitchId(channel.twitchId) || isTestTwitchId(channel.twitchId)) return { ok: false, reason: 'protected' }
  const steps: string[] = []

  const key = tokenKey()
  for (const c of channel.connections) {
    if (!key || !c.refreshTokenEnc) continue
    try { await revokeGoogleToken(fetch, decryptToken(c.refreshTokenEnc, key)); steps.push(`autorisation ${c.platform} retirée`) } catch { steps.push(`autorisation ${c.platform} : à retirer toi-même dans ton compte Google`) }
  }

  const clientId = readEnv('TWITCH_CLIENT_ID')
  const clientSecret = readEnv('TWITCH_CLIENT_SECRET')
  if (clientId && clientSecret) {
    try { await createTwitchApi({ clientId, clientSecret }).unsubscribeUser(channel.twitchId); steps.push('écoute des lives arrêtée') } catch { steps.push('écoute des lives : arrêt à confirmer par l’équipe') }
  }

  // Abonnement : annule chez Stripe avant d'effacer (jamais de prelevement sur un compte supprime). Les donnees de carte restent chez Stripe.
  const billing = await prisma.channelBilling.findUnique({ where: { channelId }, select: { stripeSubscriptionId: true } })
  if (billing?.stripeSubscriptionId) {
    const stripe = stripeClient()
    if (!stripe) steps.push('abonnement : à annuler par l’équipe')
    else {
      try { await stripe.cancelSubscription(billing.stripeSubscriptionId); steps.push('abonnement annulé') } catch { steps.push('abonnement : annulation à confirmer par l’équipe') }
    }
  }

  await eraseChannel(channelId)
  await prisma.channelInvite.deleteMany({ where: { OR: [{ twitchId: channel.twitchId }, { twitchLogin: channel.login.toLowerCase() }] } })
  steps.push('données et fichiers effacés')
  return { ok: true, steps }
}
