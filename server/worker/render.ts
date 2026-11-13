import { createPipelineStore, outputDirectory } from '../utils/clipping/prismaPipelineStore'
import { relative } from 'node:path'
import { QcFailedError, renderJob } from '../utils/clipping/clipJobPipeline'
import { LongQcFailedError, renderLongJob } from '../utils/clipping/longRender'
import { LONG_DEFAULT_MAX_SEC, clampLongMax } from '../utils/clipping/longExtract'
import { probeClip } from '../utils/clipping/clipQc'
import { createProgressWriter } from '../utils/clipping/progressWriter'
import { dataDir } from '../utils/clipping/dataDir'
import { collectClipMetrics } from '../utils/clipping/clipQc'
import { runFfmpeg } from '../utils/clipping/ffmpegRunner'
import { existsSync } from 'node:fs'
import { getVodVideoPlaylistUrl } from '../utils/clipping/vodPlaylist'
import { coversPlan, sourceRelPath, sourceWindow } from '../utils/clipping/sourceExtract'
import { detectFraming, frameExtractor, runLocateScript } from '../utils/clipping/framingDetect'
import { detectLayout } from '../utils/clipping/layoutDetect'
import { join, resolve } from 'node:path'
import type { ClipJobToRender } from '../utils/clipping/clipQueue'
import { prisma } from '../utils/prisma'
import { retrying } from '../utils/clipping/dbRetry'

const store = retrying(createPipelineStore(prisma), { onRetry: (error, attempt) => console.warn(`[worker] base injoignable (tentative ${attempt}), nouvel essai`) })

// Rend un clip : charge le contexte (moment, DA, fichiers du streamer), lance le pipeline et enregistre le resultat.
// Le worker marque le job "review" (via markReview) ou "failed" ; ici on enrichit la ligne avant de rendre la main.
// Extrait long (16:9, choisi par le streamer) : simple coupe de la VOD, sans pipeline d'analyse ni habillage.
async function renderLongClip(job: ClipJobToRender): Promise<{ outputPath: string }> {
  const row = await prisma.clipJob.findUniqueOrThrow({
    where: { id: job.id },
    select: { startSec: true, endSec: true, moment: { select: { vod: { select: { twitchVodId: true, channel: { select: { settings: { select: { longExtractMaxSec: true, longExtractVerified: true } } } } } } } } }
  })
  const progress = createProgressWriter(async (percent) => { await prisma.clipJob.update({ where: { id: job.id }, data: { progress: percent } }) })
  await prisma.clipJob.update({ where: { id: job.id }, data: { progress: 0 } }).catch(() => {})
  try {
    const result = await renderLongJob({
      jobId: job.id,
      vodTwitchId: row.moment.vod.twitchVodId,
      startSec: row.startSec,
      endSec: row.endSec,
      maxSec: clampLongMax(row.moment.vod.channel.settings?.longExtractMaxSec ?? LONG_DEFAULT_MAX_SEC, row.moment.vod.channel.settings?.longExtractVerified ?? false)
    }, {
      getVideoUrl: vodId => getVodVideoPlaylistUrl(vodId, 720),
      runFfmpeg,
      probe: probeClip,
      outputDir: outputDirectory(),
      threads: Number(process.env.RENDER_THREADS) > 0 ? Number(process.env.RENDER_THREADS) : 2,
      onProgress: progress.report
    })
    await prisma.clipJob.update({ where: { id: job.id }, data: { qc: result.qc as any, error: null } })
    await progress.done()
    return { outputPath: relative(dataDir(), result.outputPath).replace(/\\/g, '/') }
  } catch (error) {
    if (error instanceof LongQcFailedError) await prisma.clipJob.update({ where: { id: job.id }, data: { qc: error.report as any } }).catch(() => {})
    throw error
  }
}

export async function renderClip(job: ClipJobToRender): Promise<{ outputPath: string }> {
  const kind = await prisma.clipJob.findUnique({ where: { id: job.id }, select: { format: true } })
  if (kind?.format === 'long') return renderLongClip(job)
  const ctx = await store.loadJobContext(job.id)
  const progress = createProgressWriter(async (percent) => { await prisma.clipJob.update({ where: { id: job.id }, data: { progress: percent } }) })
  await prisma.clipJob.update({ where: { id: job.id }, data: { progress: 0 } }).catch(() => {})
  try {
    const result = await renderJob(ctx, {
      getVideoUrl: vodId => getVodVideoPlaylistUrl(vodId, 720),
      // Extrait source du moment s'il existe et couvre la coupe (la VOD peut alors etre reservee aux abonnes ou supprimee) ; sinon la VOD.
      getVideoSource: async (job, plan) => {
        if (job.vodId && job.momentId) {
          const file = join(dataDir(), sourceRelPath(job.vodId, job.momentId))
          if (existsSync(file) && coversPlan(job.peakSec, plan)) return { input: file, baseSec: sourceWindow(job.peakSec).startSec }
        }
        return { input: await getVodVideoPlaylistUrl(job.vodTwitchId, 720), baseSec: 0 }
      },
      detectFraming: input => detectFraming(input, {
        extractFrame: frameExtractor(runFfmpeg),
        locate: runLocateScript,
        modelsDir: process.env.VISION_MODELS_DIR || join(dataDir(), 'models')
      }),
      // Ecran partage : ne bloque jamais le rendu (en cas d'erreur, le clip est rendu en plein cadre).
      detectLayout: input => detectLayout(input, {
        extractFrame: frameExtractor(runFfmpeg),
        analyse: request => runLocateScript(request, { script: resolve(process.cwd(), 'scripts/vision/detect_layout.py') }),
        modelsDir: process.env.VISION_MODELS_DIR || join(dataDir(), 'models')
      }).catch((error) => {
        // Le clip est rendu en plein cadre, mais on garde la raison dans le journal du worker.
        console.warn(`[render] ecran partage : detection impossible (${error instanceof Error ? error.message : error})`)
        return null
      }),
      runFfmpeg,
      collectMetrics: collectClipMetrics,
      outputDir: outputDirectory(),
      threads: Number(process.env.RENDER_THREADS) > 0 ? Number(process.env.RENDER_THREADS) : 2,
      onProgress: progress.report
    })
    await store.saveJobResult(job.id, result)
    await progress.done()
    // Chemin relatif au dossier de donnees, comme dans saveJobResult.
    return { outputPath: relative(dataDir(), result.outputPath).replace(/\\/g, '/') }
  } catch (error) {
    if (error instanceof QcFailedError) await store.saveQcFailure(job.id, error.report).catch(() => {})
    throw error
  }
}
