import { prisma } from '../utils/prisma'
import { runClipWorker } from '../utils/clipping/clipQueue'
import { createPrismaClipQueueStore } from '../utils/clipping/prismaClipQueueStore'
import { renderClip } from './render'

// Process pm2 separe du serveur Nuxt : un rendu video ne doit jamais bloquer le site.
let stopping = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.info(`[worker] ${signal} recu : arret apres le rendu en cours`)
    stopping = true
  })
}

console.info('[worker] demarrage')
runClipWorker({
  store: createPrismaClipQueueStore(prisma),
  render: renderClip,
  shouldStop: () => stopping,
  log: (message, detail) => (detail === undefined ? console.info('[worker]', message) : console.error('[worker]', message, detail))
})
  .then(summary => console.info('[worker] arret propre', summary))
  .catch((error) => {
    console.error('[worker] erreur fatale', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
