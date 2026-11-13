import type { PrismaClient } from '@prisma/client'
import { clampLongMax } from './longExtract.ts'
import type { Seg } from './longAnalysis.ts'
import type { AnalysisJob, AnalysisStore } from './longAnalysisRun.ts'

type Db = Pick<PrismaClient, 'longAnalysis' | 'longProposal' | 'notification' | '$transaction'>

const seconds = (a: Date | null, b: Date | null) => a && b ? Math.max(0, (b.getTime() - a.getTime()) / 1000) : null

export function createPrismaLongAnalysisStore(db: Db, options: { skip?: () => string[] } = {}): AnalysisStore & { notify: (job: AnalysisJob, count: number) => Promise<void> } {
  return {
    // La plus ancienne analyse a faire (en attente, ou commencee), hors celles que le worker met de cote apres une erreur.
    async next() {
      const row = await db.longAnalysis.findFirst({
        where: { status: { in: ['queued', 'running'] }, ...(options.skip?.().length ? { id: { notIn: options.skip() } } : {}) },
        orderBy: { createdAt: 'asc' },
        include: { vod: { select: { twitchVodId: true, title: true, startedAt: true, endedAt: true } }, channel: { select: { settings: { select: { longExtractMaxSec: true, longExtractVerified: true } } } } }
      })
      if (!row) return null
      const taken = await db.longProposal.findMany({ where: { vodId: row.vodId, NOT: { AND: [{ origin: 'analysis' }, { status: 'proposed' }] } }, select: { startSec: true, endSec: true } })
      const settings = row.channel.settings
      return {
        id: row.id, vodId: row.vodId, channelId: row.channelId, twitchVodId: row.vod.twitchVodId, vodTitle: row.vod.title, status: row.status,
        transcribedSec: row.transcribedSec,
        durationSec: row.durationSec ?? seconds(row.vod.startedAt, row.vod.endedAt),
        transcript: Array.isArray(row.transcript) ? row.transcript as unknown as Seg[] : [],
        maxSec: clampLongMax(settings?.longExtractMaxSec ?? 600, settings?.longExtractVerified ?? false),
        taken
      } satisfies AnalysisJob
    },

    async markRunning(id, durationSec) {
      await db.longAnalysis.update({ where: { id }, data: { status: 'running', durationSec, startedAt: new Date(), error: null } })
    },

    async appendTranscript(id, segments, transcribedSec) {
      const row = await db.longAnalysis.findUniqueOrThrow({ where: { id }, select: { transcript: true } })
      const previous = Array.isArray(row.transcript) ? row.transcript as unknown as Seg[] : []
      await db.longAnalysis.update({ where: { id }, data: { transcript: [...previous, ...segments] as any, transcribedSec, status: 'running' } })
    },

    // Les propositions de l'analyse precedente qui n'ont pas ete touchees sont remplacees ; celles que le streamer a ignorees, preparees ou
    // ajoutees a la main restent (et leurs passages sont exclus de la nouvelle recherche).
    async finish(job, proposals) {
      await db.$transaction(async (tx) => {
        await tx.longProposal.deleteMany({ where: { vodId: job.vodId, origin: 'analysis', status: 'proposed' } })
        if (proposals.length) {
          await tx.longProposal.createMany({
            data: proposals.map(p => ({ channelId: job.channelId, vodId: job.vodId, origin: 'analysis', title: p.title.slice(0, 100), theme: p.theme.slice(0, 160) || null, why: p.why || null, score: p.score, startSec: p.startSec, endSec: p.endSec }))
          })
        }
        await tx.longAnalysis.update({ where: { id: job.id }, data: { status: 'done', proposalsCount: proposals.length, finishedAt: new Date(), error: null } })
      })
    },

    async fail(id, status, error) {
      await db.longAnalysis.update({ where: { id }, data: { status, error: error.slice(0, 500) } })
    },

    // Cloche du studio : une notification par analyse terminee.
    async notify(job, count) {
      await db.notification.create({
        data: {
          channelId: job.channelId, kind: 'long_analysis', title: 'Analyse terminée',
          body: count > 0
            ? `${count} proposition${count > 1 ? 's' : ''} d’extraits longs ${count > 1 ? 'attendent' : 'attend'} ton choix pour « ${job.vodTitle ?? 'ton live'} ».`
            : `Aucun passage assez solide trouvé dans « ${job.vodTitle ?? 'ton live'} ». Tu peux toujours en ajouter à la main.`
        }
      })
    }
  }
}
