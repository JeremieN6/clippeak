import { createPipelineStore, outputDirectory } from '../utils/clipping/prismaPipelineStore'
import { relative } from 'node:path'
import { QcFailedError, renderJob } from '../utils/clipping/clipJobPipeline'
import { dataDir } from '../utils/clipping/dataDir'
import { collectClipMetrics } from '../utils/clipping/clipQc'
import { runFfmpeg } from '../utils/clipping/ffmpegRunner'
import { getVodVideoPlaylistUrl } from '../utils/clipping/vodPlaylist'
import type { ClipJobToRender } from '../utils/clipping/clipQueue'
import { prisma } from '../utils/prisma'

const store = createPipelineStore(prisma)

// Rend un clip : charge le contexte (moment, DA, fichiers du streamer), lance le pipeline et enregistre le resultat.
// Le worker marque le job "review" (via markReview) ou "failed" ; ici on enrichit la ligne avant de rendre la main.
export async function renderClip(job: ClipJobToRender): Promise<{ outputPath: string }> {
  const ctx = await store.loadJobContext(job.id)
  try {
    const result = await renderJob(ctx, {
      getVideoUrl: vodId => getVodVideoPlaylistUrl(vodId, 720),
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
