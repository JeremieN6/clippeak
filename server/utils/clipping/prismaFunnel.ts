import type { PrismaClient } from '@prisma/client'
import { computeFunnel, effectiveQuota, quotaReachedAt, type FunnelChannel, type FunnelResult } from './funnel.ts'
import { isQuotaExempt } from './quota.ts'
import { packsClips, planFor } from './billing.ts'

// Lecture de la base pour l'entonnoir d'acquisition (regles de calcul : ./funnel.ts). Lecture seule : ne touche aucune table des flux
// d'invitation ou de premiers clips, ne renvoie ni identifiant, ni pseudo, ni titre.
type Db = Pick<PrismaClient, 'accessRequest' | 'channelInvite' | 'channel' | 'clipJob'>

export async function loadFunnel(db: Db, now: Date = new Date()): Promise<FunnelResult> {
  const [requests, invites, channels, jobs] = await Promise.all([
    db.accessRequest.findMany({ select: { createdAt: true } }),
    db.channelInvite.findMany({ select: { createdAt: true, twitchId: true } }),
    db.channel.findMany({
      select: {
        id: true, twitchId: true, createdAt: true,
        style: { select: { config: true, updatedAt: true } },
        settings: { select: { monthlyClipQuota: true } },
        billing: { select: { status: true, packs: true, createdAt: true, lastEventAt: true } }
      }
    }),
    // Clips verticaux produits (les echecs de rendu ne comptent pas : le streamer ne les a jamais vus).
    db.clipJob.findMany({
      where: { format: 'short', status: { not: 'failed' } },
      select: { status: true, createdAt: true, updatedAt: true, reviewedAt: true, moment: { select: { vod: { select: { channelId: true } } } } }
    })
  ])

  const jobsBy = new Map<string, typeof jobs>()
  for (const j of jobs) {
    const id = j.moment.vod.channelId
    const list = jobsBy.get(id)
    if (list) list.push(j); else jobsBy.set(id, [j])
  }

  const real: FunnelChannel[] = []
  for (const c of channels) {
    if (isQuotaExempt(c.twitchId)) continue // chaines de demonstration et de test (admin)
    const mine = jobsBy.get(c.id) ?? []
    const ready = mine.filter(j => j.status === 'review' || j.status === 'approved' || j.status === 'rejected')
    const approved = mine.filter(j => j.status === 'approved')
    const min = (dates: Date[]) => (dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null)
    const onboarding = (c.style?.config as { onboarding?: { completed?: boolean } } | null)?.onboarding
    const paying = c.billing && planFor(c.billing.status) === 'creator'
    // Plafond actuel de la chaine (approximation : un plafond change depuis est applique a tout l'historique).
    const quota = effectiveQuota({ twitchId: c.twitchId, setting: c.settings ? c.settings.monthlyClipQuota : undefined, planClips: paying ? packsClips(c.billing!.packs) : 0 })
    real.push({
      twitchId: c.twitchId,
      connectedAt: c.createdAt,
      onboardingAt: onboarding?.completed ? c.style!.updatedAt : null,
      batchAt: min(ready.map(j => j.createdAt)),
      validatedAt: min(approved.map(j => j.reviewedAt ?? j.updatedAt)),
      quotaAt: quotaReachedAt(mine.map(j => j.createdAt), quota),
      paidAt: paying ? (c.billing!.lastEventAt ?? c.billing!.createdAt) : null
    })
  }

  return computeFunnel({ requests: requests.map(r => r.createdAt), invites, channels: real }, now)
}
