import { createPipelineStore, outputDirectory } from '../utils/clipping/prismaPipelineStore'
import { relative } from 'node:path'
import { QcFailedError, renderJob } from '../utils/clipping/clipJobPipeline'
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
export async function renderClip(job: ClipJobToRender): Promise<{ outputPath: string }> {
  const ctx = await store.loadJobContext(job.id)
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
      }),
      runFfmpeg,
      collectMetrics: collectClipMetrics,
      outputDir: outputDirectory(),
      threads: Number(process.env.RENDER_THREADS) > 0 ? Number(process.env.RENDER_THREADS) : 2
    })
    await store.saveJobResult(job.id, result)
    // Chemin relatif au dossier de donnees, comme dans saveJobResult.
    return { outputPath: relative(dataDir(), result.outputPath).replace(/\\/g, '/') }
  } catch (error) {
    if (error instanceof QcFailedError) await store.saveQcFailure(job.id, error.report).catch(() => {})
    throw error
  }
}
