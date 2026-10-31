// Serveur de demonstration pour verifier le studio a l'ecran : base jetable (PGlite) + build de production + quelques clips de test.
// Usage : npx nuxt build && node scripts/integration/ui-serve.mjs <racine du depot>
// Puis ouvrir http://127.0.0.1:3398/studio (mot de passe jetable affiche au demarrage). Ctrl+C pour arreter ; rien n'est ecrit sur Neon.
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { openSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const ROOT = resolve(process.argv[2] ?? '.')
const DATA = join(ROOT, '.output', 'ui', 'data')
const PORT = 3398
const DBPORT = 54331
const PW = 'mdp-de-test-jetable'

rmSync(DATA, { recursive: true, force: true })
mkdirSync(join(DATA, 'clips'), { recursive: true })

const db = await PGlite.create()
const dir = join(ROOT, 'prisma', 'migrations')
for (const name of readdirSync(dir).filter(n => /^\d+_/.test(n)).sort()) await db.exec(readFileSync(join(dir, name, 'migration.sql'), 'utf8').replace(/^﻿/, ''))
await new PGLiteSocketServer({ db, port: DBPORT, host: '127.0.0.1' }).start()
const q = async (sql, params) => (await db.query(sql, params)).rows

const [{ id: channelId }] = await q(`INSERT INTO channels (id, twitch_id, login, display_name) VALUES (gen_random_uuid(), '1', 'jeremfut7', 'Jeremfut7') RETURNING id`)
await q(`INSERT INTO streamer_settings (id, channel_id, updated_at) VALUES (gen_random_uuid(), $1, now())`, [channelId])
const [{ id: vodId }] = await q(`INSERT INTO vods (id, channel_id, twitch_vod_id, url, status) VALUES (gen_random_uuid(), $1, '1', 'u', 'done') RETURNING id`, [channelId])

// Session de demonstration : poser le cookie clippeak_session=jeton-demo dans le navigateur pour entrer comme le streamer (sans passer par Twitch).
await q(`INSERT INTO studio_sessions (id, channel_id, token_hash, expires_at) VALUES (gen_random_uuid(), $1, $2, now() + interval '1 day')`, [channelId, createHash('sha256').update('jeton-demo').digest('hex')])

// Compte YouTube factice (jetons bidon : aucune publication reelle n'est possible depuis cette base) pour voir le panneau Publier.
await q(`INSERT INTO platform_connections (id, channel_id, platform, access_token_enc, refresh_token_enc, updated_at) VALUES (gen_random_uuid(), $1, 'youtube', 'v1.x.y.z', 'v1.x.y.z', now())`, [channelId])

// Deux VODs reservees aux abonnes pour voir les cartes « Action requise » et « Tu peux la remettre comme avant ».
await q(`INSERT INTO vods (id, channel_id, twitch_vod_id, url, title, status, restricted_at) VALUES (gen_random_uuid(), $1, '2', 'u', 'LIVE DU SOIR - TOUT LE MONDE', 'blocked', now())`, [channelId])
await q(`INSERT INTO vods (id, channel_id, twitch_vod_id, url, title, status, restricted_at, sources_saved_at) VALUES (gen_random_uuid(), $1, '3', 'u', 'PETIT STREAM - !SUBS', 'done', now() - interval '1 hour', now())`, [channelId])

const clips = [
  { batch: 2, status: 'review', title: 'Il a vraiment dit ça en direct devant tout le monde', score: 8.6, cat: 'Réaction', why: 'Ton chat s’est emballé en quelques secondes.', video: true },
  { batch: 2, status: 'review', title: 'Le penalty que personne n’a vu venir', score: 8.1, cat: 'Football', why: 'detecte par ressemblance avec les clips de reference (pas par le chat) : même retournement.', video: true },
  { batch: 2, status: 'approved', title: 'Pourquoi l’arbitre a fait ça ?!', score: 7.4, cat: 'Réaction', why: 'Ton chat réagit fort pendant 6 secondes.', video: true },
  { batch: 1, status: 'approved', title: 'Le but que tout le monde attendait', score: 8.9, cat: 'Football', why: 'Ton chat explose.', video: true, published: true },
  { batch: 2, status: 'rendering', title: 'Mon chat a complètement pété les plombs', score: 6.9, cat: 'Humour', why: 'Le moment ressemble à un de tes clips.' },
  { batch: 1, status: 'rejected', title: 'Un silence de vingt secondes', score: 5.2, cat: 'Humour', why: 'Peu de réactions du chat.' },
  { batch: 1, status: 'failed', title: 'Rendu cassé', score: 7.0, cat: 'Football', why: 'Ton chat explose.', error: 'Le rendu a échoué : la vidéo source est introuvable.' }
]
for (const [i, c] of clips.entries()) {
  const [{ id: momentId }] = await q(`INSERT INTO moments (id, vod_id, start_sec, end_sec, peak_sec, score, signals, ai_score, rationale, scorer, category, kind) VALUES (gen_random_uuid(), $1, 0, 30, 15, 7, '{}', $2, $3, 'local', $4, 'story') RETURNING id`, [vodId, c.score, c.why, c.cat])
  const [{ id }] = await q(`INSERT INTO clip_jobs (id, moment_id, status, batch, title, caption, hashtags, error, start_sec, end_sec, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, '#twitch #clip', $6, 0, $7, now()) RETURNING id`, [momentId, c.status, c.batch, c.title, `Légende du clip ${i + 1}`, c.error ?? null, 20 + i * 5])
  if (c.published) await q(`INSERT INTO publications (id, clip_job_id, platform, status, scheduled_at, published_at, external_url, updated_at) VALUES (gen_random_uuid(), $1, 'youtube', 'published', now() - interval '2 hours', now() - interval '2 hours', 'https://youtube.com/shorts/demo', now())`, [id])
  if (c.video) {
    const rel = `clips/${id}.mp4`
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=270x480:rate=30:duration=3', '-pix_fmt', 'yuv420p', join(DATA, rel)])
    await q(`UPDATE clip_jobs SET output_path = $1 WHERE id = $2`, [rel, id])
  }
}

// Faux Stripe (prix seulement) pour voir la carte « Mon offre » ; UI_BILLING=creator affiche l'offre payante deja active.
createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  if (req.url.startsWith('/v1/prices/')) return res.end(JSON.stringify({ unit_amount: 1900, currency: 'eur', recurring: { interval: 'month' } }))
  res.statusCode = 404; res.end('{}')
}).listen(3399, '127.0.0.1')
if (process.env.UI_BILLING === 'creator') await q(`INSERT INTO channel_billing (id, channel_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, updated_at) VALUES (gen_random_uuid(), $1, 'cus_demo', 'sub_demo', 'creator', $2, now() + interval '20 days', now())`, [channelId, process.env.UI_BILLING_STATUS || 'active'])

const env = { ...process.env, STRIPE_SECRET_KEY: 'sk_test_demo', STRIPE_PRICE_CREATOR: 'price_demo', STRIPE_API_BASE_URL: 'http://127.0.0.1:3399', ADMIN_PASSWORD: PW, DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${DBPORT}/postgres?connection_limit=1&sslmode=disable&pgbouncer=true`, CLIPPEAK_DATA_DIR: DATA, TWITCH_CLIENT_ID: 'demo', TWITCH_CLIENT_SECRET: 'demo', GOOGLE_CLIENT_ID: 'demo', GOOGLE_CLIENT_SECRET: 'demo', CLIPPEAK_TOKEN_KEY: Buffer.alloc(32, 7).toString('base64'), CLIPPEAK_FONTS_DIR: join(ROOT, 'public', 'fonts'), PORT: String(PORT), NITRO_PORT: String(PORT) }
const cwd = join(DATA, 'cwd')
mkdirSync(cwd, { recursive: true })
const logFd = openSync(join(DATA, 'server.log'), 'w')
spawn('node', [join(ROOT, '.output', 'server', 'index.mjs')], { env, cwd, stdio: ['ignore', logFd, logFd] })
console.log('Entrer comme streamer : document.cookie = "clippeak_session=jeton-demo; path=/" puis recharger.')
console.log(`Studio de demonstration : http://127.0.0.1:${PORT}/studio  (mot de passe : ${PW})`)
await new Promise(() => {})
