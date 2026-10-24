export interface ClipJobToRender {
  id: string
  momentId: string
  title: string | null
}

export interface ClipQueueStore {
  // Au demarrage : remet en file les rendus interrompus par un arret du worker (un seul worker, donc aucun rendu n'est legitimement en cours).
  requeueInterrupted(): Promise<number>
  // Prend atomiquement le prochain job (queued -> rendering), ou null si la file est vide.
  claimNext(): Promise<ClipJobToRender | null>
  markReview(id: string, outputPath: string): Promise<void>
  markFailed(id: string, error: string): Promise<void>
}

export type RenderFn = (job: ClipJobToRender) => Promise<{ outputPath: string }>

export interface WorkerOptions {
  store: ClipQueueStore
  render: RenderFn
  shouldStop: () => boolean
  // Appelee quand la file de rendu est vide (ex. analyse d'une VOD terminee) ; renvoie true si elle a travaille,
  // auquel cas la boucle repart tout de suite au lieu de dormir.
  idleTask?: () => Promise<boolean>
  pollMs?: number
  errorBackoffMs?: number
  sleep?: (ms: number) => Promise<void>
  log?: (message: string, detail?: unknown) => void
}

export interface WorkerSummary {
  done: number
  failed: number
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const MAX_ERROR_LENGTH = 2000

// Un seul rendu a la fois (le VPS est partage avec le site) : la boucle est volontairement sequentielle.
export async function runClipWorker(options: WorkerOptions): Promise<WorkerSummary> {
  const sleep = options.sleep ?? wait
  const log = options.log ?? (() => {})
  const pollMs = options.pollMs ?? 5_000
  const errorBackoffMs = options.errorBackoffMs ?? 30_000
  const summary: WorkerSummary = { done: 0, failed: 0 }

  const requeued = await options.store.requeueInterrupted()
  if (requeued) log(`${requeued} rendu(s) interrompu(s) remis en file`)

  while (!options.shouldStop()) {
    let job: ClipJobToRender | null
    try {
      job = await options.store.claimNext()
    } catch (error) {
      log('lecture de la file impossible', error)
      await sleep(errorBackoffMs)
      continue
    }
    if (!job) {
      let worked = false
      if (options.idleTask) {
        try {
          worked = await options.idleTask()
        } catch (error) {
          log('tache de fond en echec', error)
        }
      }
      if (!worked) await sleep(pollMs)
      continue
    }

    try {
      const { outputPath } = await options.render(job)
      await options.store.markReview(job.id, outputPath)
      summary.done++
      log(`clip ${job.id} pret pour validation`)
    } catch (error) {
      summary.failed++
      const message = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LENGTH)
      log(`clip ${job.id} en echec`, message)
      try {
        await options.store.markFailed(job.id, message)
      } catch (storeError) {
        // Le job restera "rendering" : il sera remis en file au prochain demarrage.
        log(`impossible de marquer le clip ${job.id} en echec`, storeError)
      }
    }
  }
  return summary
}
