import { relative } from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { clipsDir, dataDir, safeResolve } from './dataDir'
import { parseStyle } from './streamerStyle'
import { assignBatches } from './batching'
import { tagsFromFilename } from './illustrations'
import type { JobContext, JobResult } from './clipJobPipeline'
import type { AnalyzedMoment } from './vodAnalysis'
import type { TranscriptSegment } from './whisperTranscribe'
import type { IllustrationItem } from './illustrations'
import type { ReferenceClip } from './referenceClips'

type Db = Pick<PrismaClient, 'clipJob' | 'moment' | 'vod' | 'streamerAsset' | 'referenceClip' | 'channel'> & Partial<Pick<PrismaClient, '$transaction'>>

export interface VodToAnalyze {
  id: string
  twitchVodId: string
  channelId: string
  channelName: string
  keywords: string[]
}

export function createPipelineStore(db: Db) {
  async function assetPath(channelId: string, assetId: string | null | undefined, kinds: string[]) {
    if (!assetId) return null
    const asset = await db.streamerAsset.findFirst({ where: { id: assetId, channelId, kind: { in: kinds } } })
    return asset ? { path: safeResolve(dataDir(), asset.path), filename: asset.filename } : null
  }

  return {
    // Contexte complet d'un job : moment, VOD, chaine, reglages, DA et fichiers du streamer.
    async loadJobContext(jobId: string): Promise<JobContext> {
      const job = await db.clipJob.findUniqueOrThrow({
        where: { id: jobId },
        include: { moment: { include: { vod: { include: { channel: { include: { settings: true, style: true } } } } } } }
      })
      const moment = job.moment
      const channel = moment.vod.channel
      const style = parseStyle(channel.style?.config)
      const settings = channel.settings

      const sfx = await assetPath(channel.id, style.sfx.assetId, ['sfx'])
      const overlay = await assetPath(channel.id, style.overlay.assetId, ['avatar'])
      const illustrationRows = await db.streamerAsset.findMany({ where: { channelId: channel.id, kind: 'illustration' } })
      const library: IllustrationItem[] = illustrationRows.map(row => ({
        path: safeResolve(dataDir(), row.path),
        tags: row.tags.length ? row.tags : tagsFromFilename(row.filename),
        source: row.source || row.filename,
        durationSec: 4
      }))

      const keepRanges = job.keepRanges as Array<{ start: number, end: number }> | null
      return {
        jobId: job.id,
        channelName: channel.displayName,
        vodTwitchId: moment.vod.twitchVodId,
        peakSec: moment.peakSec,
        transcript: (moment.transcript as TranscriptSegment[] | null) ?? [],
        hook: moment.hook,
        category: moment.category,
        title: job.title,
        plan: job.startSec !== null && job.endSec !== null && keepRanges
          ? { startSec: job.startSec, endSec: job.endSec, keepRanges }
          : null,
        settings: {
          keywords: settings?.keywords ?? [],
          clipMinSec: settings?.clipMinSec ?? 30,
          clipMaxSec: settings?.clipMaxSec ?? 60,
          subtitles: settings?.subtitles ?? true,
          accentColor: settings?.accentColor ?? '#FFFFFF',
          highlightColor: settings?.highlightColor ?? '#FFD400'
        },
        style,
        assets: {
          sfxPath: sfx?.path,
          overlayPath: overlay?.path,
          overlayAnimated: overlay ? overlay.filename.toLowerCase().endsWith('.gif') : false
        },
        library
      }
    },

    async saveJobResult(jobId: string, result: JobResult) {
      await db.clipJob.update({
        where: { id: jobId },
        data: {
          status: 'review',
          title: result.title,
          caption: result.caption,
          hashtags: result.hashtags.join(' '),
          // Chemin relatif au dossier de donnees : la base ne depend pas de l'emplacement du serveur.
          outputPath: relative(dataDir(), result.outputPath).replace(/\\/g, '/'),
          error: null,
          startSec: result.plan.startSec,
          endSec: result.plan.endSec,
          keepRanges: result.plan.keepRanges as any,
          qc: result.qc as any,
          illustrations: result.illustrations as any
        }
      })
    },

    // Un clip refuse par le controle qualite garde son rapport pour que le relecteur voie pourquoi.
    async saveQcFailure(jobId: string, qc: unknown) {
      await db.clipJob.update({ where: { id: jobId }, data: { qc: qc as any } })
    },

    // VOD terminee, sans moment encore : prise en charge atomique (ended -> analyzing).
    async claimVodToAnalyze(): Promise<VodToAnalyze | null> {
      const candidate = await db.vod.findFirst({
        where: { status: 'ended', moments: { none: {} }, channel: { autoClip: true } },
        orderBy: { createdAt: 'asc' },
        include: { channel: { include: { settings: true } } }
      })
      if (!candidate) return null
      const claimed = await db.vod.updateMany({ where: { id: candidate.id, status: 'ended' }, data: { status: 'analyzing' } })
      if (claimed.count !== 1) return null
      return {
        id: candidate.id,
        twitchVodId: candidate.twitchVodId,
        channelId: candidate.channelId,
        channelName: candidate.channel.displayName,
        keywords: candidate.channel.settings?.keywords ?? []
      }
    },

    async setVodStatus(vodId: string, status: 'done' | 'failed' | 'ended') {
      await db.vod.update({ where: { id: vodId }, data: { status } })
    },

    async referenceClips(channelId: string): Promise<ReferenceClip[]> {
      const rows = await db.referenceClip.findMany({ where: { channelId } })
      return rows.map(r => ({ id: r.twitchClipId, title: r.title, viewCount: r.viewCount, durationSec: r.durationSec, category: r.category }))
    },

    // Enregistre les moments retenus et met en file les meilleurs, par lots de 4 (les plus notes d'abord).
    async saveAnalysis(vodId: string, moments: AnalyzedMoment[], maxClips = 8) {
      const created: Array<{ momentId: string, score: number }> = []
      for (const m of moments) {
        const row = await db.moment.create({
          data: {
            vodId,
            startSec: m.peak.startSec,
            endSec: m.peak.endSec,
            peakSec: m.peak.peakSec,
            score: m.peak.score,
            signals: m.peak.signals as any,
            status: 'candidate',
            transcript: m.transcript.segments as any,
            beforePeak: m.transcript.beforePeak,
            hook: m.score.hook,
            category: m.score.category,
            kind: m.score.kind,
            aiScore: m.score.score,
            rationale: m.score.rationale,
            scorer: m.score.scorer
          }
        })
        created.push({ momentId: row.id, score: m.score.score })
      }

      const top = [...created].sort((a, b) => b.score - a.score).slice(0, maxClips)
      const last = await db.clipJob.aggregate({ _max: { batch: true } })
      const assignments = assignBatches(top.map(t => ({ id: t.momentId, score: t.score })), last._max.batch ?? 0)
      for (const a of assignments) {
        await db.moment.update({ where: { id: a.id }, data: { status: 'validated' } })
        await db.clipJob.create({ data: { momentId: a.id, batch: a.batch, status: 'queued' } })
      }
      return { moments: created.length, queued: assignments.length }
    }
  }
}

export type PipelineStore = ReturnType<typeof createPipelineStore>
export const outputDirectory = clipsDir
