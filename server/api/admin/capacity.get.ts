import { prisma } from '../../utils/prisma'
import { requireStudioAdmin } from '../../utils/studioAuth'
import { UPGRADE_RULE, recommendation, summarize, verdictOf } from '../../utils/clipping/capacity'

// Capacite du serveur pour l'onglet « Capacite » de l'administration (admin seulement) : derniere mesure, courbe de charge des dernieres 24 h,
// temps de rendu et d'attente des clips (7 jours), vitesse d'analyse des lives, et un conseil en clair. Tout vient des mesures ecrites par le
// worker (une par minute) et du chronometrage des clips.
const BUCKET_MS = 15 * 60_000

export default defineEventHandler(async (event) => {
  requireStudioAdmin(event)
  const now = Date.now()
  const [latest, recent, renders, analysis, share] = await Promise.all([
    prisma.opsSample.findFirst({ orderBy: { at: 'desc' } }),
    prisma.opsSample.findMany({ where: { at: { gte: new Date(now - 24 * 3600_000) } }, orderBy: { at: 'asc' }, select: { at: true, load1: true, cores: true }, take: 2000 }),
    prisma.$queryRaw<Array<{ render_sec: number, wait_sec: number }>>`
      SELECT extract(epoch FROM ("rendered_at" - "render_started_at"))::float AS render_sec, extract(epoch FROM ("render_started_at" - "created_at"))::float AS wait_sec
      FROM "public"."clip_jobs" WHERE "rendered_at" > now() - interval '7 days' AND "render_started_at" IS NOT NULL`,
    prisma.$queryRaw<Array<{ n: number, audio_sec: number, work_sec: number }>>`
      SELECT count(*)::int AS n, coalesce(sum("transcribed_sec"), 0)::float AS audio_sec, coalesce(sum(extract(epoch FROM ("finished_at" - "started_at"))), 0)::float AS work_sec
      FROM "public"."long_analyses" WHERE "status" = 'done' AND "started_at" IS NOT NULL AND "finished_at" > now() - interval '30 days'`,
    prisma.$queryRaw<Array<{ n: number, hot: number }>>`
      SELECT count(*)::int AS n, count(*) FILTER (WHERE "load1" > 1.5 * "cores")::int AS hot FROM "public"."ops_samples" WHERE "at" > now() - interval '7 days'`
  ])

  // Courbe : une valeur par quart d'heure (la charge la plus haute du quart d'heure, c'est elle qui fait ralentir).
  const buckets = new Map<number, { at: number, load1: number, cores: number }>()
  for (const s of recent) {
    const key = Math.floor(s.at.getTime() / BUCKET_MS) * BUCKET_MS
    const kept = buckets.get(key)
    if (!kept || s.load1 > kept.load1) buckets.set(key, { at: key, load1: s.load1, cores: s.cores })
  }
  const series = [...buckets.values()].sort((a, b) => a.at - b.at).map(b => ({ at: new Date(b.at).toISOString(), load1: b.load1, cores: b.cores }))

  const render = summarize(renders.map(r => r.render_sec))
  const wait = summarize(renders.map(r => r.wait_sec))
  const a = analysis[0]
  const samples7d = share[0]?.n ?? 0
  const saturatedShare = samples7d ? (share[0]?.hot ?? 0) / samples7d : null
  const verdict = latest ? verdictOf(latest) : null
  return {
    latest: latest ? { ...latest, at: latest.at.toISOString(), verdict } : null,
    // Plus de 5 minutes sans mesure : le worker est arrete ou bloque.
    silent: latest ? now - latest.at.getTime() > 5 * 60_000 : false,
    series,
    render: { n: render.n, medianSec: render.median, p90Sec: render.p90, maxSec: render.max, perDay: Math.round(render.n / 7 * 10) / 10 },
    wait: { n: wait.n, medianSec: wait.median, p90Sec: wait.p90, maxSec: wait.max },
    analysis: { n: a?.n ?? 0, audioSec: a?.audio_sec ?? 0, workSec: a?.work_sec ?? 0, speed: a && a.work_sec > 0 ? Math.round(a.audio_sec / a.work_sec * 100) / 100 : null },
    samples7d,
    saturatedShare,
    recommendation: recommendation({ verdict, saturatedShare, waitP90Sec: wait.p90, samples: samples7d }),
    upgradeRule: UPGRADE_RULE
  }
})
