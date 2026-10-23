import { prisma } from '../utils/prisma'
import { runClipWorker } from '../utils/clipping/clipQueue'
import { createPrismaClipQueueStore } from '../utils/clipping/prismaClipQueueStore'
import { analysisStep } from './analysis'
import { renderClip } from './render'

// Process pm2 separe du serveur Nuxt : un rendu video ne doit jamais bloquer le site.
let stopping = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.info(`[worker] ${signal} recu : arret apres la tache en cours`)
    stopping = true
  })
}

// Sondage de la file : Neon ne se met en veille que si la base reste au repos, on espace donc les lectures.
const pollMs = Math.max(5, Number(process.env.WORKER_POLL_SEC) || 20) * 1000

console.info('[worker] demarrage')
runClipWorker({
  store: createPrismaClipQueueStore(prisma),
  render: renderClip,
  idleTask: analysisStep,
  pollMs,
  shouldStop: () => stopping,
  log: (message, detail) => (detail === undefined ? console.info('[worker]', message) : console.error('[worker]', message, detail))
})
  .then(summary => console.info('[worker] arret propre', summary))
  .catch((error) => {
    console.error('[worker] erreur fatale', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
