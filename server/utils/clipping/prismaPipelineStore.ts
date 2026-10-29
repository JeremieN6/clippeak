import { existsSync } from 'node:fs'
import { relative } from 'node:path'
import { bundledFontsDir } from './fonts'
import type { PrismaClient } from '@prisma/client'
import { clipsDir, dataDir, safeResolve } from './dataDir'
import { parseStyle, referencedSoundAssets } from './streamerStyle'
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
  startedAt: Date | null
}

export interface ScanTarget {
  id: string
  twitchVodId: string
  channelId: string
  live: boolean
  startedAt: Date
  durationSec: number | null
  scanSec: number
}

export interface BatchToNotify {
  batch: number
  clips: Array<{ id: string, title: string | null, caption: string | null, score: number | null, outputPath: string }>
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

      // Seuls les SFX de CE streamer sont resolus ; un identifiant d'un autre streamer est ignore.
      const sfxPaths: Record<string, string> = {}
      for (const assetId of referencedSoundAssets(style)) {
        const sfx = await assetPath(channel.id, assetId, ['sfx'])
        if (sfx) sfxPaths[assetId] = sfx.path
      }
      const overlay = await assetPath(channel.id, style.overlay.assetId, ['avatar'])
      const illustrationRows = await db.streamerAsset.findMany({ where: { channelId: channel.id, kind: 'illustration' } })
      const library: IllustrationItem[] = illustrationRows.map(row => ({
        path: safeResolve(dataDir(), row.path),
        tags: row.tags.length ? row.tags : tagsFromFilename(row.filename),
        source: row.source || row.filename,
        durationSec: 4
      }))

      const photoRows = await db.streamerAsset.findMany({ where: { channelId: channel.id, kind: 'photo' }, orderBy: { createdAt: 'desc' }, take: 8 })
      const photoPaths = photoRows.map(row => safeResolve(dataDir(), row.path))
      // Polices fournies avec l'application (le streamer les choisit dans la DA) ; absentes = police systeme (Lato).
      const fontsDir = existsSync(bundledFontsDir()) ? bundledFontsDir() : undefined

      const keepRanges = job.keepRanges as Array<{ start: number, end: number }> | null
      return {
        jobId: job.id,
        vodId: moment.vodId,
        momentId: moment.id,
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
          sfxPaths,
          overlayPath: overlay?.path,
          overlayAnimated: overlay ? overlay.filename.toLowerCase().endsWith('.gif') : false
        },
        library,
        photoPaths,
        fontsDir
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

    // VOD terminee : prise en charge atomique (ended -> analyzing). Une VOD deja analysee pendant le live repasse ici
    // pour le reste du stream ; les pics deja traites sont ecartes par existingPeaks.
    async claimVodToAnalyze(): Promise<VodToAnalyze | null> {
      const candidate = await db.vod.findFirst({
        // Une VOD ajoutee a la main est toujours analysee (chaines de test comprises) ; les autres seulement si la chaine est ecoutee.
        where: { status: 'ended', OR: [{ channel: { autoClip: true } }, { source: 'manual' }] },
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
        keywords: candidate.channel.settings?.keywords ?? [],
        startedAt: candidate.startedAt
      }
    },

    // VODs dont le direct est en cours (analyse par tranches pendant le live) ; leur statut ne change pas.
    async listLiveVods(): Promise<VodToAnalyze[]> {
      const rows = await db.vod.findMany({
        where: { status: 'live', channel: { autoClip: true } },
        orderBy: { createdAt: 'asc' },
        include: { channel: { include: { settings: true } } }
      })
      return rows.map(row => ({
        id: row.id,
        twitchVodId: row.twitchVodId,
        channelId: row.channelId,
        channelName: row.channel.displayName,
        keywords: row.channel.settings?.keywords ?? [],
        startedAt: row.startedAt
      }))
    },

    // Pics deja transformes en moments pour cette VOD (evite les doublons entre deux passages).
    // VOD a balayer par ressemblance : le direct en cours d'abord, puis les VODs terminees dont le balayage n'est pas fini.
    // Duree d'une VOD terminee = fin - debut du direct (inconnue => jamais balayee).
    async vodsToScan(): Promise<ScanTarget[]> {
      const rows = await db.vod.findMany({
        // Les VODs terminees ne sont balayees que pendant 3 jours : pas de retour sur tout l'historique d'une chaine.
        // Une VOD qui a ete reservee aux abonnes n'est plus relue apres l'analyse : pas de balayage (il lirait sa video).
        where: { OR: [{ status: 'live' }, { status: 'done', restrictedAt: null, createdAt: { gte: new Date(Date.now() - 3 * 24 * 3600 * 1000) } }], startedAt: { not: null }, channel: { autoClip: true } },
        orderBy: { createdAt: 'asc' },
        include: { channel: { select: { displayName: true } } }
      })
      const targets = rows.map((row): ScanTarget => ({
        id: row.id,
        twitchVodId: row.twitchVodId,
        channelId: row.channelId,
        live: row.status === 'live',
        startedAt: row.startedAt as Date,
        durationSec: row.status === 'done' && row.endedAt ? Math.max(0, (row.endedAt.getTime() - (row.startedAt as Date).getTime()) / 1000) : null,
        scanSec: row.scanSec ?? 0
      }))
      return targets.filter(t => t.live || (t.durationSec !== null && t.scanSec < t.durationSec - 10)).sort((a, b) => Number(b.live) - Number(a.live))
    },

    async setScanSec(vodId: string, scanSec: number) {
      await db.vod.update({ where: { id: vodId }, data: { scanSec } })
    },

    async existingPeaks(vodId: string): Promise<number[]> {
      const rows = await db.moment.findMany({ where: { vodId }, select: { peakSec: true } })
      return rows.map(r => r.peakSec)
    },

    // Lots dont plus aucun clip n'est en file ou en rendu et dont au moins un clip est a valider, pas encore notifies.
    async findBatchesToNotify(): Promise<BatchToNotify[]> {
      const jobs = await db.clipJob.findMany({
        where: { batch: { not: null }, status: { in: ['queued', 'rendering', 'review'] } },
        orderBy: [{ batch: 'asc' }, { createdAt: 'asc' }],
        include: { moment: { select: { aiScore: true } } }
      })
      const byBatch = new Map<number, typeof jobs>()
      for (const job of jobs) byBatch.set(job.batch as number, [...(byBatch.get(job.batch as number) ?? []), job])
      const result: BatchToNotify[] = []
      for (const [batch, items] of byBatch) {
        if (items.some(j => j.status === 'queued' || j.status === 'rendering')) continue
        const ready = items.filter(j => j.status === 'review' && j.notifiedAt === null && j.outputPath)
        if (!ready.length) continue
        result.push({ batch, clips: ready.map(j => ({ id: j.id, title: j.title, caption: j.caption, score: j.moment.aiScore, outputPath: j.outputPath as string })) })
      }
      return result
    },

    async markNotified(jobIds: string[]) {
      if (!jobIds.length) return
      await db.clipJob.updateMany({ where: { id: { in: jobIds } }, data: { notifiedAt: new Date() } })
    },

    async setVodStatus(vodId: string, status: 'done' | 'failed' | 'ended' | 'blocked', error: string | null = null) {
      await db.vod.update({ where: { id: vodId }, data: { status, error } })
    },

    // VOD reservee aux abonnes : elle attend d'etre rendue publique. `restrictedAt` garde la PREMIERE fois (c'est la preuve qu'elle
    // etait reservee aux abonnes, donc ce qu'il faudra remettre).
    async markBlocked(vodId: string, error: string) {
      const vod = await db.vod.findUniqueOrThrow({ where: { id: vodId }, select: { restrictedAt: true } })
      await db.vod.update({ where: { id: vodId }, data: { status: 'blocked', error, restrictedAt: vod.restrictedAt ?? new Date(), restoreAckAt: null, sourcesSavedAt: null } })
    },

    async listBlockedVods(): Promise<Array<{ id: string, twitchVodId: string, title: string | null, channelName: string }>> {
      const rows = await db.vod.findMany({ where: { status: 'blocked' }, orderBy: { createdAt: 'asc' }, take: 20, include: { channel: { select: { displayName: true } } } })
      return rows.map(r => ({ id: r.id, twitchVodId: r.twitchVodId, title: r.title, channelName: r.channel.displayName }))
    },

    // Moments de la VOD qui ont (ou ont eu) un clip : ce sont eux qui ont besoin d'un extrait source.
    async momentsNeedingSources(vodId: string): Promise<Array<{ id: string, peakSec: number }>> {
      const rows = await db.moment.findMany({ where: { vodId, jobs: { some: {} } }, select: { id: true, peakSec: true }, orderBy: { peakSec: 'asc' } })
      return rows
    },

    async markSourcesSaved(vodId: string) {
      await db.vod.update({ where: { id: vodId }, data: { sourcesSavedAt: new Date() } })
    },

    async vodAccessInfo(vodId: string): Promise<{ restrictedAt: Date | null, title: string | null, channelName: string }> {
      const vod = await db.vod.findUniqueOrThrow({ where: { id: vodId }, select: { restrictedAt: true, title: true, channel: { select: { displayName: true } } } })
      return { restrictedAt: vod.restrictedAt, title: vod.title, channelName: vod.channel.displayName }
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
