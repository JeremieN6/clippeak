import type { ClipJobToRender } from '../utils/clipping/clipQueue'

// Le rendu reel (coupe verticale 1080x1920, cadrage, montage) arrive avec les etapes suivantes du brief.
// Tant qu'il n'existe pas, un job pris par le worker est marque en echec avec un message explicite.
export async function renderClip(job: ClipJobToRender): Promise<{ outputPath: string }> {
  throw new Error(`Rendu non implemente (clip ${job.id})`)
}
