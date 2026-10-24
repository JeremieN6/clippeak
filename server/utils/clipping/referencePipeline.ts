import type { AnalysisFrame, AnalysisInput, ReferenceAnalysis } from './referenceAnalysis.ts'
import type { YtDlpMeta } from './ytdlp.ts'

export interface ReferenceJob {
  id: string
  channelId: string
  kind: string
  source: string
  url: string | null
  filePath: string | null
  title: string | null
}

export interface ReferenceResult {
  title: string | null
  durationSec: number | null
  viewCount: number | null
  likeCount: number | null
  commentCount: number | null
  shareCount: number | null
  filePath: string | null
  transcript: string
  analysis: ReferenceAnalysis
}

export interface ReferenceStore {
  requeueInterrupted(): Promise<number>
  claimNext(): Promise<ReferenceJob | null>
  saveDone(id: string, result: ReferenceResult): Promise<void>
  saveFailed(id: string, error: string): Promise<void>
  // Cree les clips d'un compte (ceux deja presents sont ignores) et marque le compte traite ; renvoie le nombre ajoute.
  finishAccount(job: ReferenceJob, urls: string[]): Promise<number>
}

export interface DownloadedClip {
  // Chemin absolu du fichier telecharge.
  absolutePath: string
  meta: YtDlpMeta
}

export interface ReferenceDeps {
  expandAccount(url: string): Promise<string[]>
  download(job: ReferenceJob): Promise<DownloadedClip>
  // Chemin absolu d'un fichier depose par le streamer.
  uploadedPath(job: ReferenceJob): string
  probeDuration(videoPath: string): Promise<number | null>
  extractAudio(videoPath: string, wavPath: string): Promise<void>
  transcribe(wavPath: string): Promise<string>
  extractFrames(videoPath: string, durationSec: number | null): Promise<AnalysisFrame[]>
  analyze(input: AnalysisInput): Promise<ReferenceAnalysis>
  tempWavPath(): string
  removeFile(path: string): Promise<void>
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500)

// Instants des images cles (en secondes) : reparties sur la duree, sans toucher aux extremites (noir / fondu).
export function frameTimestamps(durationSec: number | null, count = 6): number[] {
  const duration = durationSec && durationSec > 0 ? durationSec : 10
  const n = Math.max(1, Math.min(6, count))
  return Array.from({ length: n }, (_, i) => Math.round(duration * ((i + 0.5) / n) * 10) / 10)
}

// Traite un element de la banque : compte -> liste de clips ; clip -> telechargement (ou fichier depose), duree, audio,
// transcription, images cles, analyse. Une erreur marque l'element en echec sans arreter le worker.
export async function processReference(job: ReferenceJob, store: ReferenceStore, deps: ReferenceDeps): Promise<'account' | 'done' | 'failed'> {
  if (job.kind === 'account') {
    try {
      if (!job.url) throw new Error('Compte sans adresse')
      await store.finishAccount(job, await deps.expandAccount(job.url))
      return 'account'
    } catch (error) {
      await store.saveFailed(job.id, errorMessage(error))
      return 'failed'
    }
  }

  const wav = deps.tempWavPath()
  let downloaded: DownloadedClip | null = null
  try {
    let videoPath: string
    let meta: YtDlpMeta | null = null
    if (job.filePath) {
      videoPath = deps.uploadedPath(job)
    } else if (job.url) {
      downloaded = await deps.download(job)
      videoPath = downloaded.absolutePath
      meta = downloaded.meta
    } else {
      throw new Error('Clip sans fichier ni adresse')
    }

    const durationSec = meta?.durationSec ?? await deps.probeDuration(videoPath)
    await deps.extractAudio(videoPath, wav)
    const transcript = (await deps.transcribe(wav)).replace(/\s+/g, ' ').trim()
    const frames = await deps.extractFrames(videoPath, durationSec)
    const title = job.title ?? meta?.title ?? null
    const analysis = await deps.analyze({ title, transcript, frames, durationSec })

    await store.saveDone(job.id, {
      title,
      durationSec,
      viewCount: meta?.viewCount ?? null,
      likeCount: meta?.likeCount ?? null,
      commentCount: meta?.commentCount ?? null,
      shareCount: meta?.shareCount ?? null,
      filePath: job.filePath,
      transcript,
      analysis
    })
    return 'done'
  } catch (error) {
    await store.saveFailed(job.id, errorMessage(error)).catch(() => {})
    return 'failed'
  } finally {
    // Les videos telechargees ne sont pas conservees (seule l'analyse l'est) ; les fichiers deposes restent.
    await deps.removeFile(wav).catch(() => {})
    if (downloaded) await deps.removeFile(downloaded.absolutePath).catch(() => {})
  }
}

// Une etape du worker : reprend les elements interrompus au demarrage (une seule fois), puis traite le suivant.
export function createReferenceStep(store: ReferenceStore, deps: ReferenceDeps, log: (message: string, detail?: unknown) => void = () => {}) {
  let resumed = false
  return async function referenceStep(): Promise<boolean> {
    if (!resumed) {
      resumed = true
      const count = await store.requeueInterrupted()
      if (count) log(`${count} element(s) de la banque de reference repris apres interruption`)
    }
    const job = await store.claimNext()
    if (!job) return false
    const outcome = await processReference(job, store, deps)
    log(`banque de reference : ${job.kind} ${job.source} ${outcome}`)
    return true
  }
}
