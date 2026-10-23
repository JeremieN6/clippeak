import { prisma } from '../utils/prisma'
import { runClipWorker } from '../utils/clipping/clipQueue'
import { createPrismaClipQueueStore } from '../utils/clipping/prismaClipQueueStore'
import { commandWorks, hasBlockingIssue, REQUIRED_SCHEMA, runPreflight } from '../utils/clipping/preflight'
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

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

async function missingSchema(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ table_name: string, column_name: string }>>`
    SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`
  const present = new Set(rows.map(r => `${r.table_name}.${r.column_name}`))
  return REQUIRED_SCHEMA.filter(r => !present.has(`${r.table}.${r.column}`)).map(r => `${r.table}.${r.column}`)
}

// Attend que l'environnement soit pret au lieu de planter en boucle : migration appliquee, ffmpeg present.
async function waitUntilReady(python: string) {
  let announced = ''
  while (!stopping) {
    try {
      const issues = await runPreflight({ missingSchema, commandWorks, python })
      const key = JSON.stringify(issues)
      if (key !== announced) {
        announced = key
        for (const issue of issues) (issue.level === 'error' ? console.error : console.warn)(`[worker] ${issue.message}`)
      }
      if (!hasBlockingIssue(issues)) return
    } catch (error) {
      console.error('[worker] verification de l\'environnement impossible', error)
    }
    await sleep(60_000)
  }
}

// Sondage de la file : Neon ne se met en veille que si la base reste au repos, on espace donc les lectures.
const pollMs = Math.max(5, Number(process.env.WORKER_POLL_SEC) || 20) * 1000

async function main() {
  console.info('[worker] demarrage')
  await waitUntilReady(process.env.WHISPER_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'))
  if (stopping) return
  const summary = await runClipWorker({
    store: createPrismaClipQueueStore(prisma),
    render: renderClip,
    idleTask: analysisStep,
    pollMs,
    shouldStop: () => stopping,
    log: (message, detail) => (detail === undefined ? console.info('[worker]', message) : console.error('[worker]', message, detail))
  })
  console.info('[worker] arret propre', summary)
}

main()
  .catch((error) => {
    console.error('[worker] erreur fatale', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
