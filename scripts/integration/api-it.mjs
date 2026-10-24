// Harnais d'integration : PGlite + vrai serveur Nitro (build de production) + tests HTTP, dans un seul processus.
// Usage : npm i --no-save @electric-sql/pglite @electric-sql/pglite-socket && npx nuxt build
//         node scripts/integration/api-it.mjs <racine du depot> <dossier de donnees jetable>
// Les routes qui parlent a Twitch (banque de reference) ne sont testees que si TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET sont definis.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { openSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const ROOT = resolve(process.argv[2] ?? '.')
const DATA = resolve(process.argv[3] ?? join(ROOT, '.output', 'it', 'data'))
const PORT = 3399
const DBPORT = 54330
const B = `http://localhost:${PORT}`
const PW = 'mdp-de-test-jetable'

rmSync(DATA, { recursive: true, force: true })
mkdirSync(join(DATA, 'clips'), { recursive: true })

const db = await PGlite.create()
const dir = join(ROOT, 'prisma', 'migrations')
for (const name of readdirSync(dir).filter(n => /^\d+_/.test(n)).sort()) await db.exec(readFileSync(join(dir, name, 'migration.sql'), 'utf8').replace(/^﻿/, ''))
const socket = new PGLiteSocketServer({ db, port: DBPORT, host: '127.0.0.1' })
await socket.start()
const q = async (sql, params) => (await db.query(sql, params)).rows

// --- donnees de depart
const [{ id: channelId }] = await q(`INSERT INTO channels (id, twitch_id, login, display_name) VALUES (gen_random_uuid(), '198013846', 'yassencore', 'YassEncore') RETURNING id`)
await q(`INSERT INTO streamer_settings (id, channel_id, updated_at) VALUES (gen_random_uuid(), $1, now())`, [channelId])
const [{ id: otherId }] = await q(`INSERT INTO channels (id, twitch_id, login, display_name) VALUES (gen_random_uuid(), '1', 'autre', 'Autre') RETURNING id`)
const [{ id: vodId }] = await q(`INSERT INTO vods (id, channel_id, twitch_vod_id, url, status) VALUES (gen_random_uuid(), $1, '999001', 'u', 'done') RETURNING id`, [channelId])
const [{ id: momentId }] = await q(`INSERT INTO moments (id, vod_id, start_sec, end_sec, peak_sec, score, signals) VALUES (gen_random_uuid(), $1, 0, 10, 5, 7, '{}') RETURNING id`, [vodId])
const job = async (status, extra = '') => (await q(`INSERT INTO clip_jobs (id, moment_id, status, batch, updated_at ${extra ? ', ' + extra.split('=')[0] : ''}) VALUES (gen_random_uuid(), $1, $2, 1, now() ${extra ? ', ' + extra.split('=')[1] : ''}) RETURNING id`, [momentId, status]))[0].id
const reviewId = await job('review')
const queuedId = await job('queued')
const failedId = await job('failed')
const rel = `clips/${reviewId}.mp4`
spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=270x480:rate=30:duration=2', '-pix_fmt', 'yuv420p', join(DATA, rel)])
await q(`UPDATE clip_jobs SET output_path = $1 WHERE id = $2`, [rel, reviewId])

// --- serveur
const env = { ...process.env, ADMIN_PASSWORD: PW, DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${DBPORT}/postgres?connection_limit=1&sslmode=disable&pgbouncer=true`, CLIPPEAK_DATA_DIR: DATA, PORT: String(PORT), NITRO_PORT: String(PORT) }
const cwd = join(DATA, 'cwd'); mkdirSync(cwd, { recursive: true })
const logFd = openSync(join(DATA, 'server.log'), 'w')
const server = spawn('node', [join(ROOT, '.output', 'server', 'index.mjs')], { env, cwd, stdio: ['ignore', logFd, logFd] })
for (let i = 0; i < 40; i++) { try { await fetch(B + '/'); break } catch { await new Promise(r => setTimeout(r, 500)) } }

let last = null
const call = async (path, { method = 'GET', body, headers = {}, auth = true, raw = false } = {}) => {
  const init = { method, headers: { ...(auth ? { 'x-admin-password': PW } : {}), ...headers } }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json' }
  const res = await fetch(B + path, init)
  if (raw) { last = { path, status: res.status }; return res }
  const text = await res.text(); let json; try { json = JSON.parse(text) } catch { json = text }
  last = { path, status: res.status, body: JSON.stringify(json).slice(0, 300) }
  return { status: res.status, json }
}
const ok = m => console.log('  ok -', m)
const form = (kind, filename, data, extra = {}) => { const f = new FormData(); f.append('kind', kind); for (const [k, v] of Object.entries(extra)) f.append(k, v); f.append('file', new Blob([data]), filename); return f }

let failure = null
try {
  assert.equal((await call('/api/studio/channels', { auth: false })).status, 401)
  ok('401 sans mot de passe')

  const list = await call('/api/studio/channels')
  assert.equal(list.status, 200)
  assert.ok(list.json.channels.some(c => c.id === channelId))
  const detail = await call(`/api/studio/channels/${channelId}`)
  assert.equal(detail.status, 200)
  assert.equal(detail.json.style.title.maxLines, 3)
  assert.equal(JSON.stringify(detail.json).replace(/\\\\/g, '/').includes(DATA.replace(/\\/g, '/')), false)
  assert.equal((await call('/api/studio/channels/11111111-1111-4111-8111-111111111111')).status, 404)
  ok('liste et detail (sans chemin serveur) ; 404 pour un streamer inconnu')

  const settings = { keywords: ['MDR', 'mdr', 'ptdr', 'kekw'], clipMinSec: 20, clipMaxSec: 45, subtitles: true, accentColor: '#FFFFFF', highlightColor: '#FF00AA' }
  const put = (body) => call(`/api/studio/channels/${channelId}/settings`, { method: 'PUT', body })
  assert.equal((await put(settings)).status, 200)
  const after = await call(`/api/studio/channels/${channelId}`)
  assert.deepEqual(after.json.settings.keywords, ['mdr', 'ptdr', 'kekw'])
  assert.equal(after.json.settings.clipMaxSec, 45)
  assert.equal((await put({ ...settings, clipMaxSec: 10 })).status, 400)
  assert.equal((await put({ ...settings, highlightColor: 'rouge' })).status, 400)
  assert.equal((await put({ ...settings, keywords: [] })).status, 400)
  ok('reglages : enregistres (mots-cles dedoublonnes), durees et couleurs invalides refusees')

  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47]), Buffer.alloc(64)])
  const upload = (kind, name, data, extra) => call(`/api/studio/channels/${channelId}/assets`, { method: 'POST', body: form(kind, name, data, extra) })
  const up = await upload('photo', '../../moi.png', png, { tags: 'Visage, moi', source: 'perso' })
  assert.equal(up.status, 200)
  assert.equal(up.json.filename, 'moi.png')
  assert.deepEqual(up.json.tags, ['visage', 'moi'])
  const [stored] = await q(`SELECT path FROM streamer_assets WHERE id = $1`, [up.json.id])
  assert.ok(existsSync(join(DATA, stored.path)))
  assert.ok(stored.path.startsWith(`assets/${channelId}/`))
  assert.equal((await upload('photo', 'virus.exe', png)).status, 400)
  assert.equal((await upload('photo', 'faux.png', Buffer.from('<?php system($_GET[1]); ?>'))).status, 400)
  assert.equal((await upload('photo', 'gros.png', Buffer.concat([png, Buffer.alloc(9 * 1024 * 1024)]))).status, 400)
  assert.equal((await upload('inconnu', 'a.png', png)).status, 400)
  assert.equal((await call(`/api/studio/channels/${channelId}/assets`, { method: 'POST', auth: false, body: form('photo', 'a.png', png) })).status, 401)
  ok('depot : chemin neutralise, extension / contenu / taille / type verifies, 401 sans mot de passe')

  const sfx = await upload('sfx', 'vent.wav', Buffer.concat([Buffer.from('RIFF\0\0\0\0WAVEfmt '), Buffer.alloc(40)]))
  assert.equal(sfx.status, 200)
  const putStyle = (style) => call(`/api/studio/channels/${channelId}/style`, { method: 'PUT', body: style })
  const goodStyle = { ...detail.json.style, sfx: { enabled: true, volume: 0.5, assetId: sfx.json.id }, names: ['YassEncore'] }
  assert.equal((await putStyle(goodStyle)).status, 200)
  assert.equal((await call(`/api/studio/channels/${channelId}`)).json.style.sfx.assetId, sfx.json.id)
  assert.equal((await putStyle({ ...goodStyle, title: { ...goodStyle.title, color: 'noir' } })).status, 400)
  assert.equal((await putStyle({ ...goodStyle, framing: { centerX: 3, centerY: 0.5, zoom: 1 } })).status, 400)
  const [{ id: foreignId }] = await q(`INSERT INTO streamer_assets (id, channel_id, kind, filename, path) VALUES (gen_random_uuid(), $1, 'sfx', 'x.wav', 'assets/x/x.wav') RETURNING id`, [otherId])
  assert.equal((await putStyle({ ...goodStyle, sfx: { ...goodStyle.sfx, assetId: foreignId } })).status, 400)
  ok('direction artistique : enregistree, couleur / cadrage invalides refuses, fichier d\'un autre streamer refuse')

  assert.equal((await call(`/api/studio/assets/${up.json.id}`, { method: 'DELETE' })).status, 200)
  assert.equal(existsSync(join(DATA, stored.path)), false)
  assert.equal((await call(`/api/studio/assets/${up.json.id}`, { method: 'DELETE' })).status, 404)
  ok('suppression : ligne et fichier supprimes, 404 la seconde fois')

  if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET) {
  const ref = await call(`/api/studio/channels/${channelId}/reference`, { method: 'POST' })
  assert.equal(ref.status, 200)
  assert.ok(ref.json.clips > 10)
  const detail2 = await call(`/api/studio/channels/${channelId}`)
  assert.equal(detail2.json.reference.clipCount, ref.json.clips)
  assert.ok(detail2.json.reference.topics.length > 3)
  ok(`banque de reference : ${ref.json.clips} clips importes depuis Twitch, sujets et categories calcules`)
  } else console.log('  -- banque de reference ignoree (pas de cles Twitch)')

  const clips = await call('/api/studio/clips?status=review')
  assert.equal(clips.status, 200)
  const clip = clips.json.clips.find(c => c.id === reviewId)
  assert.ok(clip.videoUrl.includes('?t='))
  assert.equal(clips.json.clips.some(c => c.status !== 'review'), false)
  const token = clip.videoUrl.split('t=')[1]
  const full = await call(clip.videoUrl, { auth: false, raw: true })
  assert.equal(full.status, 200)
  assert.equal(full.headers.get('content-type'), 'video/mp4')
  const size = Number(full.headers.get('content-length'))
  assert.ok(size > 1000)
  await full.arrayBuffer()
  const part = await call(clip.videoUrl, { auth: false, raw: true, headers: { range: 'bytes=0-99' } })
  assert.equal(part.status, 206)
  assert.equal(part.headers.get('content-range'), `bytes 0-99/${size}`)
  assert.equal((await part.arrayBuffer()).byteLength, 100)
  assert.equal((await call(clip.videoUrl, { auth: false, raw: true, headers: { range: 'bytes=999999999-' } })).status, 416)
  assert.equal((await call(`/api/studio/clips/${reviewId}/video?t=${token.replace(/.$/, 'x')}`, { auth: false, raw: true })).status, 403)
  assert.equal((await call(`/api/studio/clips/${queuedId}/video?t=${token}`, { auth: false, raw: true })).status, 403)
  ok('liste a valider, video 200 / Range 206 / 416, jeton modifie ou d\'un autre clip refuse')

  const r = (id, body) => call(`/api/studio/clips/${id}/review`, { method: 'POST', body })
  assert.equal((await r(queuedId, { action: 'approve' })).status, 409)
  assert.equal((await r(reviewId, { action: 'approve', caption: 'x'.repeat(3000) })).status, 400)
  assert.equal((await r(reviewId, { action: 'publish' })).status, 400)
  assert.equal((await call(`/api/studio/clips/${reviewId}/review`, { method: 'POST', auth: false, body: { action: 'approve' } })).status, 401)
  assert.deepEqual((await r(reviewId, { action: 'approve', caption: 'Ma legende finale #twitch', note: 'top' })).json, { status: 'approved' })
  const [row] = await q(`SELECT status, caption, reviewed_at FROM clip_jobs WHERE id = $1`, [reviewId])
  assert.equal(row.status, 'approved'); assert.equal(row.caption, 'Ma legende finale #twitch'); assert.ok(row.reviewed_at)
  assert.equal((await r(reviewId, { action: 'reject' })).status, 409)
  assert.equal((await r(failedId, { action: 'requeue', title: 'Nouveau titre', replan: true })).json.status, 'queued')
  const [requeued] = await q(`SELECT status, title, error FROM clip_jobs WHERE id = $1`, [failedId])
  assert.equal(requeued.status, 'queued'); assert.equal(requeued.title, 'Nouveau titre'); assert.equal(requeued.error, null)
  assert.equal((await r(queuedId, { action: 'requeue' })).status, 409)
  ok('validation : approuver = statut seulement (rien publie), transitions interdites en 409, refaire remet en file avec le nouveau titre')

  console.log('API_IT_OK')
} catch (error) {
  failure = error
  console.log('ECHEC :', String(error.message ?? error).slice(0, 300), '| derniere reponse :', JSON.stringify(last))
} finally {
  server.kill()
  await socket.stop().catch(() => {})
  await db.close().catch(() => {})
  process.exit(failure ? 1 : 0)
}
