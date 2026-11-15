import os from 'node:os'
import { readFile } from 'node:fs/promises'
import { prisma } from '../utils/prisma'
import { alertReason, parseMemAvailableMb } from '../utils/clipping/capacity'
import type { Sample } from '../utils/clipping/capacity'
import { sendAdminMessage } from './notify'

// Mesure de capacite : toutes les minutes, charge et memoire du SERVEUR entier (il heberge d'autres applications) et files d'attente de
// Clippeak. Une minuterie a part (pas la tache « au repos » du worker, qui ne tourne jamais pendant un rendu : c'est justement la qu'on veut
// mesurer). Une erreur de mesure n'arrete jamais le worker. Les mesures sont gardees 7 jours ; une alerte Telegram/Discord part quand le
// serveur sature, au plus une par heure et par cause.
const SAMPLE_MS = 60_000
const ALERT_COOLDOWN_MS = 60 * 60_000
const PURGE_EVERY_MS = 60 * 60_000
const KEEP_RECENT = 10

async function memoryMb(): Promise<{ total: number, free: number }> {
  const total = Math.round(os.totalmem() / 1048576)
  try {
    const available = parseMemAvailableMb(await readFile('/proc/meminfo', 'utf8'))
    if (available !== null) return { total, free: available }
  } catch { /* pas Linux : on retombe sur la valeur du systeme */ }
  return { total, free: Math.round(os.freemem() / 1048576) }
}

async function collect(): Promise<Sample> {
  const [load1, load5] = os.loadavg()
  const mem = await memoryMb()
  const clips = await prisma.$queryRaw<Array<{ queued: number, rendering: number, oldest: number | null }>>`
    SELECT count(*) FILTER (WHERE "status" = 'queued')::int AS queued,
           count(*) FILTER (WHERE "status" = 'rendering')::int AS rendering,
           floor(extract(epoch FROM (now() - min("created_at") FILTER (WHERE "status" = 'queued'))))::int AS oldest
    FROM "public"."clip_jobs" WHERE "status" IN ('queued', 'rendering')`
  const analyses = await prisma.$queryRaw<Array<{ queued: number, running: number }>>`
    SELECT count(*) FILTER (WHERE "status" = 'queued')::int AS queued, count(*) FILTER (WHERE "status" = 'running')::int AS running
    FROM "public"."long_analyses" WHERE "status" IN ('queued', 'running')`
  return {
    load1: Math.round((load1 ?? 0) * 100) / 100, load5: Math.round((load5 ?? 0) * 100) / 100, cores: Math.max(1, os.cpus().length),
    memTotalMb: mem.total, memFreeMb: mem.free,
    clipsQueued: clips[0]?.queued ?? 0, clipsRendering: clips[0]?.rendering ?? 0,
    analysesQueued: analyses[0]?.queued ?? 0, analysesRunning: analyses[0]?.running ?? 0,
    oldestWaitSec: clips[0]?.oldest ?? null
  }
}

export function startMetrics(): () => void {
  const recent: Sample[] = []
  const lastAlert = new Map<string, number>()
  let running = false
  let lastPurge = 0

  const tick = async () => {
    if (running) return
    running = true
    try {
      const sample = await collect()
      recent.push(sample)
      if (recent.length > KEEP_RECENT) recent.shift()
      await prisma.opsSample.create({ data: sample })

      const alert = alertReason(recent)
      if (alert && Date.now() - (lastAlert.get(alert.kind) ?? 0) > ALERT_COOLDOWN_MS) {
        lastAlert.set(alert.kind, Date.now())
        await sendAdminMessage(alert.message)
      }
      if (Date.now() - lastPurge > PURGE_EVERY_MS) {
        lastPurge = Date.now()
        await prisma.$executeRaw`DELETE FROM "public"."ops_samples" WHERE "at" < now() - interval '7 days'`
      }
    } catch (error) {
      console.warn('[worker] mesure du serveur impossible', error instanceof Error ? error.message : error)
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => { void tick() }, SAMPLE_MS)
  void tick()
  return () => clearInterval(timer)
}
