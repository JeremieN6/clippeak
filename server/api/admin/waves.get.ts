import { prisma } from '../../utils/prisma'
import { requireStudioAdmin } from '../../utils/studioAuth'
import { loadInvitationConfig, invitedToday, purgeOldRequests, queueHead } from '../../utils/clipping/prismaWaves'
import { serverAllowsWave, waveSize, REFERRAL_LIVES } from '../../utils/clipping/waves'
import { verdictOf } from '../../utils/clipping/capacity'
import { monthStart } from '../../utils/clipping/quota'

// Onglet « Vagues » de l'administration : reglages, etat du serveur, file d'attente (avec la place de chacun) et parrainages.
export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  setResponseHeader(event, 'cache-control', 'no-store')
  await purgeOldRequests(prisma)
  const now = new Date()
  const config = await loadInvitationConfig(prisma)
  const [samples, today, queueTotal, queue, waveTotal, referredQueue, grants, referredChannels] = await Promise.all([
    prisma.opsSample.findMany({ where: { at: { gte: new Date(now.getTime() - 10 * 60_000) } }, orderBy: { at: 'desc' }, take: 20 }),
    invitedToday(prisma, now),
    prisma.accessRequest.count(),
    queueHead(prisma, 100),
    prisma.channelInvite.count({ where: { source: 'wave' } }),
    prisma.accessRequest.count({ where: { referredByChannelId: { not: null } } }),
    prisma.referralGrant.findMany({ where: { createdAt: { gte: monthStart(now) } }, select: { clips: true, kind: true, channelId: true } }),
    prisma.channel.findMany({ where: { referredById: { not: null } }, select: { id: true, displayName: true, login: true, createdAt: true, referredBy: { select: { displayName: true, login: true } } }, orderBy: { createdAt: 'desc' }, take: 100 })
  ])
  const latest = samples[0] ?? null
  const serverOk = serverAllowsWave(samples, now)
  const validated = new Set((await prisma.referralGrant.findMany({ where: { kind: 'referrer', otherChannelId: { in: referredChannels.map(c => c.id) } }, select: { otherChannelId: true } })).map(g => g.otherChannelId))
  return {
    config,
    openTaken: await prisma.channelInvite.count(),
    server: { verdict: latest ? verdictOf(latest) : null, calm: serverOk, measuredAt: latest?.at ?? null },
    invitedToday: today,
    // Ce que la prochaine vague inviterait (0 si elle est coupee, si le serveur n'est pas calme ou si le plafond du jour est atteint).
    nextWaveSize: waveSize({ enabled: config.wavesEnabled, dailyCap: config.dailyCap, invitedToday: today, serverOk, queueLength: queueTotal }),
    waveInvitesTotal: waveTotal,
    queue: { total: queueTotal, referred: referredQueue, items: queue.map((r, i) => ({ id: r.id, position: i + 1, login: r.twitchLogin, displayName: r.displayName, createdAt: r.createdAt, referred: Boolean(r.referredByChannelId) })) },
    referrals: {
      livesPerReferral: REFERRAL_LIVES,
      grantedThisMonth: grants.filter(g => g.kind === 'referrer').length,
      channels: referredChannels.map(c => ({ id: c.id, login: c.login, displayName: c.displayName, createdAt: c.createdAt, referrer: c.referredBy?.displayName || c.referredBy?.login || null, validated: validated.has(c.id) }))
    }
  }
})
