// Harnais d'integration : PGlite + vrai serveur Nitro (build de production) + tests HTTP, dans un seul processus.
// Usage : npm i --no-save @electric-sql/pglite @electric-sql/pglite-socket && npx nuxt build
//         node scripts/integration/api-it.mjs <racine du depot> <dossier de donnees jetable>
// Les routes qui parlent a Twitch (banque de reference) ne sont testees que si TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET sont definis.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { openSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
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

let open666 = false
// --- faux Twitch (jeton et profil) pour jouer le retour de connexion sans le vrai service
const fakeTwitch = createServer((req, res) => {
  let body = ''
  req.on('data', c => { body += c })
  req.on('end', () => {
    res.setHeader('content-type', 'application/json')
    if (req.url === '/oauth2/token' && new URLSearchParams(body).get('grant_type') === 'client_credentials') return res.end(JSON.stringify({ access_token: 'app-tok', expires_in: 3600 }))
    if (req.url.startsWith('/helix/videos?id=')) {
      const id = new URL(req.url, 'http://x').searchParams.get('id')
      const base = { stream_id: '1', user_login: 'friend', user_name: 'Friend', created_at: '2026-10-20T18:00:00Z', duration: '3h0m0s', url: 'https://www.twitch.tv/videos/' + id, title: 'Live de Friend' }
      const videos = { 111111: { ...base, id, type: 'archive', viewable: 'public' }, 222222: { ...base, id, type: 'highlight', viewable: 'public' }, 333333: { ...base, id, type: 'archive', viewable: 'private' }, 555555: { ...base, id, type: 'archive', viewable: 'public' }, 666666: { ...base, id, type: 'archive', viewable: 'public' } }
      return res.end(JSON.stringify({ data: videos[id] ? [videos[id]] : [] }))
    }
    if (req.url === '/oauth2/token') {
      const code = new URLSearchParams(body).get('code')
      if (code === 'code-invite') return res.end(JSON.stringify({ access_token: 'tok-invite' }))
      if (code === 'code-inconnu') return res.end(JSON.stringify({ access_token: 'tok-inconnu' }))
      res.statusCode = 400
      return res.end('{}')
    }
    if (req.url === '/token') {
      const code = new URLSearchParams(body).get('code')
      const scope = code === 'g-noscope' ? 'openid' : 'https://www.googleapis.com/auth/youtube.upload'
      if (code === 'g-code' || code === 'g-noscope') return res.end(JSON.stringify({ access_token: 'ga-access', refresh_token: 'gr-refresh', expires_in: 3600, scope }))
      res.statusCode = 400
      return res.end('{}')
    }
    if (req.url === '/open-666666') { open666 = true; return res.end('{}') }
    if (req.url === '/gql' && req.method === 'POST') {
      const asked = JSON.parse(body || '{}')
      return res.end(JSON.stringify({ data: { videoPlaybackAccessToken: { value: 'tok-' + asked.variables?.vodID, signature: 'sig' } } }))
    }
    if (req.url.startsWith('/usher/vod/')) {
      const vodRef = req.url.split('/usher/vod/')[1].split('.m3u8')[0]
      if (vodRef === '666666' && !open666) { res.statusCode = 403; return res.end(JSON.stringify([{ error_code: 'vod_manifest_restricted' }])) }
      if (vodRef === '555555') { res.statusCode = 403; return res.end(JSON.stringify([{ error_code: 'vod_manifest_restricted' }])) }
      res.setHeader('content-type', 'application/vnd.apple.mpegurl')
      return res.end('#EXTM3U\n')
    }
    if (req.url === '/helix/users') {
      const who = req.headers.authorization === 'Bearer tok-invite' ? { id: '555', login: 'Invitee', display_name: 'Invitee' } : { id: '666', login: 'stranger', display_name: 'Stranger' }
      return res.end(JSON.stringify({ data: [who] }))
    }
    res.statusCode = 404
    res.end('{}')
  })
})
await new Promise(r => fakeTwitch.listen(3397, '127.0.0.1', r))

// --- serveur
const env = { ...process.env, ADMIN_PASSWORD: PW, DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${DBPORT}/postgres?connection_limit=1&sslmode=disable&pgbouncer=true`, CLIPPEAK_DATA_DIR: DATA, PORT: String(PORT), NITRO_PORT: String(PORT), TWITCH_CLIENT_ID: 'cid-test', TWITCH_CLIENT_SECRET: 'secret-test', TWITCH_ID_BASE_URL: 'http://127.0.0.1:3397', TWITCH_API_BASE_URL: 'http://127.0.0.1:3397', TWITCH_GQL_URL: 'http://127.0.0.1:3397/gql', TWITCH_USHER_URL: 'http://127.0.0.1:3397/usher/vod', CLIPPEAK_RECHECK_COOLDOWN_MS: '0', GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsec', GOOGLE_TOKEN_URL: 'http://127.0.0.1:3397/token', CLIPPEAK_TOKEN_KEY: randomBytes(32).toString('base64') }
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

  // Apercu : lien signe par fichier, jamais pour une police ; jeton modifie ou d'un autre fichier refuse ; illustration modifiable.
  const withPreview = (await call(`/api/studio/channels/${channelId}`)).json.assets.find(a => a.id === up.json.id)
  assert.match(withPreview.previewUrl, /^\/api\/studio\/assets\/.+\/file\?t=/)
  const image = await call(withPreview.previewUrl, { auth: false, raw: true })
  assert.equal(image.status, 200)
  assert.equal(image.headers.get('content-type'), 'image/png')
  assert.equal((await call(withPreview.previewUrl.replace(/t=\d+/, 't=1'), { auth: false, raw: true })).status, 403)
  assert.equal((await upload('font', 'Police.ttf', Buffer.concat([Buffer.from([0x00, 0x01, 0x00, 0x00]), Buffer.alloc(64)]))).status, 400)
  const fonts = (await call(`/api/studio/channels/${channelId}`)).json.fonts
  assert.ok(fonts.some(f => f.family === 'Lato'))
  const styleNow = (await call(`/api/studio/channels/${channelId}`)).json.style
  assert.equal((await call(`/api/studio/channels/${channelId}/style`, { method: 'PUT', body: { ...styleNow, title: { ...styleNow.title, fontName: 'Comic Sans Inexistante' } } })).status, 400)
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmp42'), Buffer.alloc(64)])
  const ill = await upload('illustration', 'marche.mp4', mp4)
  assert.equal(ill.status, 200)
  const patch = (id, body) => call(`/api/studio/assets/${id}`, { method: 'PATCH', body })
  assert.equal((await patch(ill.json.id, { tags: ['Marche', 'legumes', 'marche'], source: 'https://exemple.test/video' })).status, 200)
  const edited = (await call(`/api/studio/channels/${channelId}`)).json.assets.find(a => a.id === ill.json.id)
  assert.deepEqual(edited.tags, ['marche', 'legumes'])
  assert.equal(edited.source, 'https://exemple.test/video')
  assert.equal((await patch(up.json.id, { tags: ['x'], source: null })).status, 404)
  assert.equal((await patch(ill.json.id, { tags: 'pas une liste', source: null })).status, 400)
  assert.equal((await call(`/api/studio/assets/${ill.json.id}`, { method: 'PATCH', auth: false, body: { tags: [], source: null } })).status, 401)
  ok('fichiers : apercu signe (image 200, jeton falsifie 403), plus de depot de police, police inconnue refusee, illustration modifiable')

  const sfx = await upload('sfx', 'vent.wav', Buffer.concat([Buffer.from('RIFF\0\0\0\0WAVEfmt '), Buffer.alloc(40)]))
  assert.equal(sfx.status, 200)
  const putStyle = (style) => call(`/api/studio/channels/${channelId}/style`, { method: 'PUT', body: style })
  const goodStyle = { ...detail.json.style, sfx: { enabled: true, volume: 0.5, intro: { enabled: true, sound: `asset:${sfx.json.id}` }, illustration: { enabled: true, sound: 'whoosh' } }, names: ['YassEncore'] }
  assert.equal((await putStyle(goodStyle)).status, 200)
  assert.equal((await call(`/api/studio/channels/${channelId}`)).json.style.sfx.intro.sound, `asset:${sfx.json.id}`)
  assert.equal((await putStyle({ ...goodStyle, title: { ...goodStyle.title, color: 'noir' } })).status, 400)
  assert.equal((await putStyle({ ...goodStyle, framing: { centerX: 3, centerY: 0.5, zoom: 1 } })).status, 400)
  const [{ id: foreignId }] = await q(`INSERT INTO streamer_assets (id, channel_id, kind, filename, path) VALUES (gen_random_uuid(), $1, 'sfx', 'x.wav', 'assets/x/x.wav') RETURNING id`, [otherId])
  assert.equal((await putStyle({ ...goodStyle, sfx: { ...goodStyle.sfx, intro: { enabled: true, sound: `asset:${foreignId}` } } })).status, 400)
  ok('direction artistique : enregistree, couleur / cadrage invalides refuses, fichier d\'un autre streamer refuse')

  const withProgress = { ...goodStyle, onboarding: { done: [1, 2], skipped: [5], completed: false, platforms: ['tiktok'] } }
  assert.equal((await putStyle(withProgress)).status, 200)
  const savedProgress = (await call(`/api/studio/channels/${channelId}`)).json.style.onboarding
  assert.deepEqual(savedProgress, withProgress.onboarding)
  assert.equal((await putStyle({ ...goodStyle, onboarding: { platforms: ['myspace'] } })).status, 400)
  ok('parcours guide : etapes faites / passees et plateformes choisies conservees, plateforme inconnue refusee')

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

  const everything = await call('/api/studio/clips?status=all')
  assert.equal(everything.status, 200)
  assert.ok(new Set(everything.json.clips.map(c => c.status)).size > 1)
  assert.ok(everything.json.clips.every(c => ['chat', 'ref'].includes(c.origin) && c.createdAt))
  ok('tous les clips d\'un coup (tableau de bord) avec leur origine et leur date')

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

  // --- invitations et connexion par session (le callback Twitch lui-meme n'est pas joue : il demande le vrai Twitch)
  assert.equal((await call('/api/admin/invites', { auth: false })).status, 401)
  assert.equal((await call('/api/admin/invites', { method: 'POST', body: { login: 'a b' } })).status, 400)
  const inv = await call('/api/admin/invites', { method: 'POST', body: { login: '  @Jeremfut7 ', note: 'ami' } })
  assert.equal(inv.status, 200); assert.equal(inv.json.login, 'jeremfut7')
  assert.equal((await call('/api/admin/invites', { method: 'POST', body: { login: 'jeremfut7' } })).json.id, inv.json.id)
  const invList = (await call('/api/admin/invites')).json.invites
  assert.equal(invList.length, 1); assert.equal(invList[0].note, 'ami'); assert.equal(invList[0].connected, false)
  ok('invitations : admin seulement, pseudo valide et normalise, idempotent')

  const sha = (t) => createHash('sha256').update(t).digest('hex')
  const [{ id: otherVod }] = await q(`INSERT INTO vods (id, channel_id, twitch_vod_id, url, status) VALUES (gen_random_uuid(), $1, '999002', 'u', 'done') RETURNING id`, [otherId])
  const [{ id: otherMoment }] = await q(`INSERT INTO moments (id, vod_id, start_sec, end_sec, peak_sec, score, signals) VALUES (gen_random_uuid(), $1, 0, 10, 5, 7, '{}') RETURNING id`, [otherVod])
  const [{ id: otherClip }] = await q(`INSERT INTO clip_jobs (id, moment_id, status, batch, updated_at) VALUES (gen_random_uuid(), $1, 'review', 9, now()) RETURNING id`, [otherMoment])
  await q(`INSERT INTO studio_sessions (id, channel_id, token_hash, expires_at) VALUES (gen_random_uuid(), $1, $2, now() + interval '1 day')`, [channelId, sha('jeton-valide')])
  await q(`INSERT INTO studio_sessions (id, channel_id, token_hash, expires_at) VALUES (gen_random_uuid(), $1, $2, now() - interval '1 day')`, [channelId, sha('jeton-expire')])
  const as = (token, extra = {}) => ({ auth: false, headers: { cookie: `clippeak_session=${token}`, ...extra } })

  assert.equal((await call('/api/auth/me', { auth: false })).status, 401)
  assert.equal((await call('/api/auth/me', as('jeton-inconnu'))).status, 401)
  assert.equal((await call('/api/auth/me', as('jeton-expire'))).status, 401)
  const me = await call('/api/auth/me', as('jeton-valide'))
  assert.equal(me.status, 200); assert.equal(me.json.channel.id, channelId)
  ok('session : sans cookie, inconnue ou expiree = 401 ; valide = sa chaine')

  const mine = await call('/api/studio/channels', as('jeton-valide'))
  assert.deepEqual(mine.json.channels.map(c => c.id), [channelId])
  assert.equal((await call(`/api/studio/channels/${channelId}`, as('jeton-valide'))).status, 200)
  assert.equal((await call(`/api/studio/channels/${otherId}`, as('jeton-valide'))).status, 404)
  assert.equal((await call(`/api/studio/channels/${otherId}/references`, as('jeton-valide'))).status, 404)
  assert.equal((await call(`/api/studio/channels/${otherId}/settings`, { ...as('jeton-valide'), method: 'PUT', body: settings })).status, 404)
  const allMine = await call('/api/studio/clips?status=all', as('jeton-valide'))
  assert.equal(allMine.status, 200)
  assert.equal(allMine.json.clips.some(c => c.id === otherClip), false)
  assert.equal((await call('/api/studio/clips?status=all')).json.clips.some(c => c.id === otherClip), true)
  assert.equal((await call(`/api/studio/clips/${otherClip}/review`, { ...as('jeton-valide'), method: 'POST', body: { action: 'reject' } })).status, 404)
  const [stillReview] = await q(`SELECT status FROM clip_jobs WHERE id = $1`, [otherClip])
  assert.equal(stillReview.status, 'review')
  const [{ id: foreignAsset }] = await q(`INSERT INTO streamer_assets (id, channel_id, kind, filename, path) VALUES (gen_random_uuid(), $1, 'sfx', 'z.wav', 'assets/z/z.wav') RETURNING id`, [otherId])
  assert.equal((await call(`/api/studio/assets/${foreignAsset}`, { ...as('jeton-valide'), method: 'DELETE' })).status, 404)
  ok('cloisonnement : un streamer ne voit ni ne modifie la chaine, les clips ou les fichiers d\'un autre (404)')

  const hostBase = new URL(B).host
  assert.equal((await call(`/api/studio/channels/${channelId}/settings`, { ...as('jeton-valide', { origin: 'https://evil.example' }), method: 'PUT', body: settings })).status, 403)
  assert.equal((await call(`/api/studio/channels/${channelId}/settings`, { ...as('jeton-valide', { origin: `http://${hostBase}` }), method: 'PUT', body: settings })).status, 200)
  ok('requete modifiante avec cookie : origine etrangere refusee (403), la notre acceptee')

  const redirect = (path, cookie) => fetch(B + path, { redirect: 'manual', headers: cookie ? { cookie } : {} })
  const noState = await redirect('/api/auth/twitch/callback?code=x&state=y')
  assert.equal(noState.status, 302); assert.ok(noState.headers.get('location').startsWith('/connexion?login=error'))
  const wrongState = await redirect('/api/auth/twitch/callback?code=x&state=y', 'clippeak_oauth_state=autre')
  assert.ok(wrongState.headers.get('location').includes('login=error'))
  const cancelled = await redirect('/api/auth/twitch/callback?error=access_denied')
  assert.ok(cancelled.headers.get('location').includes('login=cancelled'))
  const start = await redirect('/api/auth/twitch')
  assert.ok([302, 503].includes(start.status))
  if (start.status === 302) {
    assert.ok(start.headers.get('location').startsWith('https://id.twitch.tv/oauth2/authorize'))
    assert.ok((start.headers.get('set-cookie') ?? '').includes('HttpOnly'))
  }
  ok('retour Twitch : etat absent ou different = refuse, annulation geree, depart vers Twitch avec cookie HttpOnly (ou 503 non configure)')

  const del = await call(`/api/admin/invites/${inv.json.id}`, { method: 'DELETE' })
  assert.equal(del.status, 200)
  assert.equal((await call(`/api/admin/invites/${inv.json.id}`, { method: 'DELETE' })).status, 404)
  assert.equal((await call('/api/auth/logout', { ...as('jeton-valide'), method: 'POST' })).status, 200)
  assert.equal((await call('/api/auth/me', as('jeton-valide'))).status, 401)
  ok('retrait d\'invitation et deconnexion : la session est supprimee')

  // Retour de connexion complet avec le faux Twitch : invite -> chaine creee + session ; inconnu -> refuse
  await call('/api/admin/invites', { method: 'POST', body: { login: 'invitee' } })
  const good = await redirect('/api/auth/twitch/callback?code=code-invite&state=abc', 'clippeak_oauth_state=abc')
  assert.equal(good.status, 302)
  assert.equal(good.headers.get('location'), '/studio')
  const setCookies = good.headers.getSetCookie().join(' ; ')
  assert.ok(setCookies.includes('clippeak_session=') && setCookies.includes('HttpOnly') && setCookies.includes('SameSite=Lax'))
  const sessionCookie = good.headers.getSetCookie().find(c => c.startsWith('clippeak_session=')).split(';')[0]
  const meNew = await fetch(B + '/api/auth/me', { headers: { cookie: sessionCookie } })
  assert.equal(meNew.status, 200)
  const created = (await meNew.json()).channel
  assert.equal(created.login, 'invitee')
  const [{ n }] = await q(`SELECT count(*)::int AS n FROM streamer_settings WHERE channel_id = $1`, [created.id])
  assert.equal(n, 1)
  const [{ token_hash }] = await q(`SELECT token_hash FROM studio_sessions WHERE channel_id = $1`, [created.id])
  assert.notEqual(token_hash, sessionCookie.split('=')[1])
  const stranger = await redirect('/api/auth/twitch/callback?code=code-inconnu&state=abc', 'clippeak_oauth_state=abc')
  assert.ok(stranger.headers.get('location').startsWith('/attente?login='))
  const [{ k }] = await q(`SELECT count(*)::int AS k FROM channels WHERE twitch_id = '666'`)
  assert.equal(k, 0)
  const badCode = await redirect('/api/auth/twitch/callback?code=mauvais&state=abc', 'clippeak_oauth_state=abc')
  assert.ok(badCode.headers.get('location').endsWith('login=error'))
  ok('connexion Twitch (faux Twitch) : invite = chaine creee et session (jeton hache en base), non invite = refuse sans creer de chaine, code refuse = erreur')

  // --- session admin (cookie pose par /admin) et chaine de demonstration
  const adminLogin = (password) => fetch(B + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })
  assert.equal((await adminLogin('mauvais')).status, 401)
  const adminOk = await adminLogin(PW)
  assert.equal(adminOk.status, 200)
  const adminSetCookie = adminOk.headers.getSetCookie().find(c => c.startsWith('clippeak_admin='))
  assert.ok(adminSetCookie.includes('HttpOnly') && adminSetCookie.includes('SameSite=Lax') && !adminSetCookie.includes(PW))
  const adminCookie = adminSetCookie.split(';')[0]
  const asAdmin = (extra = {}) => ({ auth: false, headers: { cookie: adminCookie, ...extra } })
  assert.equal((await call('/api/admin/me', { auth: false })).status, 401)
  assert.equal((await call('/api/admin/me', { auth: false, headers: { cookie: 'clippeak_admin=123.forge' } })).status, 401)
  assert.equal((await call('/api/admin/me', asAdmin())).status, 200)
  assert.equal((await call('/api/auth/me', asAdmin())).json.role, 'admin')
  assert.equal((await call('/api/admin/invites', asAdmin())).status, 200)
  assert.equal((await call('/api/admin/invites', { ...asAdmin({ origin: 'https://evil.example' }), method: 'POST', body: { login: 'pirate' } })).status, 403)
  assert.equal((await call('/api/admin/feedback', asAdmin())).status, 200)
  assert.equal((await call(`/api/admin/feedback?password=${PW}`, { auth: false })).status, 401)
  ok('session admin : mot de passe verifie une fois, cookie HttpOnly signe, faux cookie et origine etrangere refuses, plus de mot de passe dans l\'URL')

  const demo = (await call('/api/admin/demo', { ...asAdmin(), method: 'POST' })).json.channel
  assert.equal((await call('/api/admin/demo', { ...asAdmin(), method: 'POST' })).json.channel.id, demo.id)
  const adminChannels = (await call('/api/studio/channels', asAdmin())).json.channels
  assert.equal(adminChannels.find(c => c.id === demo.id).demo, true)
  assert.equal(adminChannels.find(c => c.id === channelId).demo, false)
  const demoClips = (await call(`/api/studio/clips?status=all&channel=${demo.id}`, asAdmin())).json.clips
  assert.equal(demoClips.length, 5)
  assert.equal(demoClips.some(c => c.id === otherClip), false)
  assert.equal((await call(`/api/studio/clips?status=all&channel=${otherId}`, asAdmin())).json.clips.every(c => c.id === otherClip), true)
  const [{ autoclip }] = await q(`SELECT auto_clip AS autoclip FROM channels WHERE id = $1`, [demo.id])
  assert.equal(autoclip, false)
  ok('demonstration : creee une seule fois, signalee demo, 5 clips d\'exemple, filtre des clips par chaine, jamais ecoutee ni analysee (auto_clip = false)')

  const demoUpload = await call(`/api/studio/channels/${demo.id}/assets`, { ...asAdmin(), method: 'POST', body: form('photo', 'moi.png', png) })
  assert.equal(demoUpload.status, 200)
  const reset = (await call('/api/admin/demo/reset', { ...asAdmin(), method: 'POST' })).json.channel
  assert.notEqual(reset.id, demo.id)
  const afterReset = (await call(`/api/studio/channels/${reset.id}`, asAdmin())).json
  assert.equal(afterReset.assets.length, 0); assert.equal(afterReset.style.onboarding.completed, false)
  assert.equal((await call(`/api/studio/channels/${demo.id}`, asAdmin())).status, 404)
  assert.equal((await call(`/api/studio/clips?status=all&channel=${reset.id}`, asAdmin())).json.clips.length, 5)
  const [{ left }] = await q(`SELECT count(*)::int AS left FROM streamer_assets WHERE channel_id = $1`, [demo.id])
  assert.equal(left, 0)
  assert.equal((await call(`/api/studio/channels/${channelId}`, asAdmin())).status, 200)
  ok('remise a zero : fichiers, reglages et parcours effaces, clips d\'exemple recrees, les vraies chaines intactes')

  // --- chaines de test (un ami = une chaine, rien ne se melange)
  const createdTest = await call('/api/admin/test-channels', { ...asAdmin(), method: 'POST', body: { name: 'jeremfut7 - bmsjoel' } })
  assert.equal(createdTest.status, 200)
  const testChannel = createdTest.json.channel
  assert.equal(testChannel.autoClip, false)
  assert.equal((await call('/api/admin/test-channels', { ...asAdmin(), method: 'POST', body: { name: 'jeremfut7 - bmsjoel' } })).status, 409)
  assert.equal((await call('/api/admin/test-channels', { ...asAdmin(), method: 'POST', body: { name: '!!' } })).status, 400)
  const withTest = (await call('/api/studio/channels', asAdmin())).json.channels
  assert.equal(withTest.find(c => c.id === testChannel.id).test, true)
  assert.equal(withTest.find(c => c.id === testChannel.id).demo, false)
  assert.equal(withTest.find(c => c.id === channelId).test, false)
  // photo deposee dans la chaine de test, puis suppression de la chaine avec ses fichiers
  const testUpload = await call(`/api/studio/channels/${testChannel.id}/assets`, { ...asAdmin(), method: 'POST', body: form('photo', 'ami.png', png) })
  assert.equal(testUpload.status, 200)
  const [{ path: photoPath }] = await q(`SELECT path FROM streamer_assets WHERE channel_id = $1`, [testChannel.id])
  assert.equal(existsSync(join(DATA, photoPath)), true)
  assert.equal((await call(`/api/admin/test-channels/${channelId}`, { ...asAdmin(), method: 'DELETE' })).status, 404)
  assert.equal((await call(`/api/admin/test-channels/${demo.id}`, { ...asAdmin(), method: 'DELETE' })).status, 404)
  assert.equal((await call(`/api/admin/test-channels/${testChannel.id}`, { ...asAdmin(), method: 'DELETE' })).status, 200)
  assert.equal(existsSync(join(DATA, photoPath)), false)
  assert.equal((await call(`/api/studio/channels/${testChannel.id}`, asAdmin())).status, 404)
  assert.equal((await call('/api/admin/test-channels', { ...as(sessionCookie.split('=')[1]), method: 'POST', body: { name: 'pirate' } })).status, 401)
  ok('chaines de test : creation (doublon 409, nom invalide 400), signalees test, photo separee, suppression avec les fichiers, jamais une vraie chaine ni la demo, admin seulement')

  // Un streamer connecte ne peut ni utiliser l'administration ni voir la demonstration
  assert.equal((await call('/api/admin/me', as(sessionCookie.split('=')[1]))).status, 401)
  assert.equal((await call('/api/admin/invites', as(sessionCookie.split('=')[1]))).status, 401)
  assert.equal((await call('/api/admin/demo', { ...as(sessionCookie.split('=')[1]), method: 'POST' })).status, 401)
  assert.equal((await call('/api/admin/demo/reset', { ...as(sessionCookie.split('=')[1]), method: 'POST' })).status, 401)
  assert.equal((await call('/api/admin/feedback', as(sessionCookie.split('=')[1]))).status, 401)
  assert.equal((await call(`/api/studio/channels/${reset.id}`, as(sessionCookie.split('=')[1]))).status, 404)
  assert.equal((await call('/api/studio/channels', as(sessionCookie.split('=')[1]))).json.channels.some(c => c.demo), false)
  assert.equal((await call('/api/admin/logout', { ...asAdmin(), method: 'POST' })).status, 200)
  ok('un streamer connecte n\'accede ni aux routes admin (invitations, demonstration, feedbacks) ni a la demonstration')

  // --- publication : connexion YouTube (faux Google), programmation, annulation, cloisonnement
  await q(`INSERT INTO studio_sessions (id, channel_id, token_hash, expires_at) VALUES (gen_random_uuid(), $1, $2, now() + interval '1 day')`, [channelId, sha('jeton-pub')])
  const pub = as('jeton-pub')
  const conns = (await call(`/api/studio/channels/${channelId}/connections`, pub)).json.connections
  assert.deepEqual(conns.map(c => [c.platform, c.available, c.connected]), [['youtube', true, false], ['tiktok', false, false], ['instagram', false, false]])
  assert.equal((await call(`/api/studio/channels/${channelId}/connections`, as(sessionCookie.split('=')[1]))).status, 404)
  const publish = (id, body, who = pub) => call(`/api/studio/clips/${id}/publish`, { ...who, method: 'POST', body })
  assert.equal((await publish(reviewId, { platform: 'youtube' })).status, 409)
  assert.equal((await publish(queuedId, { platform: 'youtube' })).status, 409)
  ok('connexions : YouTube disponible et non connecte, TikTok / Instagram pas encore ; publier sans compte connecte ou sans approbation = 409')

  const ytStart = await redirect('/api/auth/youtube')
  assert.equal(ytStart.status, 302); assert.equal(ytStart.headers.get('location'), '/connexion')
  const ytAdmin = await fetch(B + '/api/auth/youtube', { redirect: 'manual', headers: { cookie: adminCookie } })
  assert.equal(ytAdmin.headers.get('location'), '/studio?connect=admin')
  const ytGo = await fetch(B + '/api/auth/youtube', { redirect: 'manual', headers: { cookie: 'clippeak_session=jeton-pub' } })
  assert.equal(ytGo.status, 302)
  const goUrl = new URL(ytGo.headers.get('location'))
  assert.equal(goUrl.origin + goUrl.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
  assert.equal(goUrl.searchParams.get('scope'), 'https://www.googleapis.com/auth/youtube.upload')
  assert.equal(goUrl.searchParams.get('access_type'), 'offline')
  const stateCookie = ytGo.headers.getSetCookie().find(c => c.startsWith('clippeak_oauth_yt=')).split(';')[0]
  assert.ok(ytGo.headers.getSetCookie().join(';').includes('HttpOnly'))
  const state = stateCookie.split('=')[1]
  assert.equal(goUrl.searchParams.get('state'), state)
  const cb = (code, st, cookie) => fetch(B + `/api/auth/youtube/callback?code=${code}&state=${st}`, { redirect: 'manual', headers: { cookie } })
  assert.equal((await cb('g-code', 'autre', `clippeak_session=jeton-pub; ${stateCookie}`)).headers.get('location'), '/studio?connect=error')
  assert.equal((await cb('g-noscope', state, `clippeak_session=jeton-pub; ${stateCookie}`)).headers.get('location'), '/studio?connect=error')
  assert.equal((await cb('g-code', state, stateCookie)).headers.get('location'), '/connexion')
  assert.equal((await fetch(B + '/api/auth/youtube/callback?error=access_denied', { redirect: 'manual', headers: { cookie: 'clippeak_session=jeton-pub' } })).headers.get('location'), '/studio?connect=cancelled')
  assert.equal((await cb('g-code', state, `clippeak_session=jeton-pub; ${stateCookie}`)).headers.get('location'), '/studio?connect=youtube')
  const [saved] = await q(`SELECT access_token_enc, refresh_token_enc, scopes FROM platform_connections WHERE channel_id = $1`, [channelId])
  assert.ok(saved.refresh_token_enc.startsWith('v1.') && !saved.refresh_token_enc.includes('gr-refresh') && !saved.access_token_enc.includes('ga-access'))
  assert.equal((await call(`/api/studio/channels/${channelId}/connections`, pub)).json.connections[0].connected, true)
  ok('connexion YouTube : depart vers Google (portee minimale, hors ligne, etat en cookie HttpOnly), etat faux / droit refuse / sans session / annulation geres, jetons CHIFFRES en base')

  assert.equal((await publish(reviewId, { platform: 'tiktok' })).status, 400)
  assert.equal((await publish(reviewId, { platform: 'youtube', at: 'demain' })).status, 400)
  assert.equal((await publish(reviewId, { platform: 'youtube', at: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString() })).status, 400)
  assert.equal((await publish(otherClip, { platform: 'youtube' })).status, 404)
  assert.equal((await publish(reviewId, { platform: 'youtube' }, as(sessionCookie.split('=')[1]))).status, 404)
  assert.equal((await publish(reviewId, { platform: 'youtube' }, { auth: false })).status, 401)
  const in2h = new Date(Date.now() + 2 * 3600 * 1000).toISOString()
  const first = await publish(reviewId, { platform: 'youtube', at: in2h })
  assert.equal(first.status, 200); assert.equal(first.json.status, 'scheduled')
  const second = await publish(reviewId, { platform: 'youtube', at: new Date(Date.now() + 48 * 3600 * 1000).toISOString() })
  assert.equal(second.json.id, first.json.id)
  const [{ n: pubCount }] = await q(`SELECT count(*)::int AS n FROM publications WHERE clip_job_id = $1`, [reviewId])
  assert.equal(pubCount, 1)
  const listed = (await call('/api/studio/clips?status=all', pub)).json.clips.find(c => c.id === reviewId)
  assert.equal(listed.publications.length, 1); assert.equal(listed.publications[0].status, 'scheduled')
  assert.equal((await call(`/api/studio/publications/${first.json.id}`, { ...as(sessionCookie.split('=')[1]), method: 'DELETE' })).status, 404)
  assert.equal((await call(`/api/studio/publications/${first.json.id}`, { ...pub, method: 'DELETE' })).status, 200)
  const again = await publish(reviewId, { platform: 'youtube' })
  assert.equal(again.json.id, first.json.id)
  const [{ scheduled_at: nowAt }] = await q(`SELECT scheduled_at FROM publications WHERE id = $1`, [first.json.id])
  assert.ok(Math.abs(new Date(nowAt + 'Z').getTime() - Date.now()) < 60_000 || Math.abs(new Date(nowAt).getTime() - Date.now()) < 3 * 3600 * 1000)
  ok('programmation : plateforme et heure validees, un seul enregistrement par clip et plateforme (reprogrammer le met a jour), annulation, autre chaine = 404, sans heure = maintenant')

  await q(`UPDATE publications SET status = 'published', external_url = 'https://www.youtube.com/shorts/V1' WHERE id = $1`, [first.json.id])
  assert.equal((await publish(reviewId, { platform: 'youtube' })).status, 409)
  assert.equal((await call(`/api/studio/publications/${first.json.id}`, { ...pub, method: 'DELETE' })).status, 409)
  await q(`UPDATE publications SET status = 'scheduled', external_url = NULL WHERE id = $1`, [first.json.id])
  assert.equal((await call(`/api/studio/channels/${channelId}/connections/youtube`, { ...as(sessionCookie.split('=')[1]), method: 'DELETE' })).status, 404)
  assert.equal((await call(`/api/studio/channels/${channelId}/connections/tiktok`, { ...pub, method: 'DELETE' })).status, 404)
  assert.equal((await call(`/api/studio/channels/${channelId}/connections/youtube`, { ...pub, method: 'DELETE' })).status, 200)
  const [afterDisconnect] = await q(`SELECT status FROM publications WHERE id = $1`, [first.json.id])
  assert.equal(afterDisconnect.status, 'cancelled')
  assert.equal((await q(`SELECT 1 FROM platform_connections WHERE channel_id = $1`, [channelId])).length, 0)
  assert.equal((await call(`/api/studio/channels/${channelId}/connections/youtube`, { ...pub, method: 'DELETE' })).status, 404)
  ok('publie = ni reprogrammable ni annulable (409) ; deconnecter efface les jetons et annule les publications programmees')

  // --- ajout manuel de VOD (admin) avec un faux Helix
  const addVod = (body, who = {}) => call('/api/admin/vods', { method: 'POST', body, ...who })
  const pubSession = as('jeton-pub')
  assert.equal((await addVod({ channelId, url: 'https://www.twitch.tv/videos/111111' }, { auth: false })).status, 401)
  assert.equal((await addVod({ channelId, url: 'https://www.twitch.tv/videos/111111' }, pubSession)).status, 401)
  assert.equal((await call('/api/admin/vods', pubSession)).status, 401)
  assert.equal((await addVod({ channelId, url: 'https://evil.example/videos/111111' })).status, 400)
  assert.equal((await addVod({ channelId: 'pas-un-uuid', url: '111111' })).status, 400)
  assert.equal((await addVod({ channelId: '11111111-1111-4111-8111-111111111111', url: '111111' })).status, 404)
  assert.equal((await addVod({ channelId: reset.id, url: '111111' })).status, 400)
  assert.equal((await addVod({ channelId, url: '222222' })).status, 400)
  assert.equal((await addVod({ channelId, url: '333333' })).status, 400)
  assert.equal((await addVod({ channelId, url: '444444' })).status, 404)
  const added = await addVod({ channelId, url: 'https://www.twitch.tv/videos/111111?t=10s' })
  assert.equal(added.status, 200)
  assert.equal(added.json.owner, 'Friend'); assert.equal(added.json.channel, 'YassEncore'); assert.equal(added.json.durationSec, 3 * 3600)
  const [vodRow] = await q(`SELECT status, source, twitch_vod_id, channel_id, title, ended_at, started_at FROM vods WHERE id = $1`, [added.json.id])
  assert.deepEqual([vodRow.status, vodRow.source, vodRow.twitch_vod_id, vodRow.channel_id], ['ended', 'manual', '111111', channelId])
  assert.equal(new Date(vodRow.ended_at + 'Z').getTime() - new Date(vodRow.started_at + 'Z').getTime(), 3 * 3600 * 1000)
  assert.equal((await addVod({ channelId, url: '111111' })).status, 409)
  ok('ajout manuel de VOD : admin seulement, lien valide, chaine reelle, VOD publique de type rediffusion, creee en attente d analyse (ended, manual), doublon refuse')

  const listedVods = (await call('/api/admin/vods')).json.vods
  assert.equal(listedVods.length, 1); assert.equal(listedVods[0].status, 'ended'); assert.equal(listedVods[0].clips, 0)
  assert.equal(listedVods[0].durationSec, 3 * 3600)
  assert.deepEqual(listedVods[0].progress, { phase: 'waiting', estimateSec: 120 + 270, clipsTotal: 0, clipsInProgress: 0 })
  assert.equal((await call(`/api/admin/vods/${added.json.id}/retry`, { method: 'POST' })).status, 409)
  await q(`UPDATE vods SET status = 'failed', error = 'VOD introuvable ou non publiée' WHERE id = $1`, [added.json.id])
  assert.equal((await call('/api/admin/vods')).json.vods.find(v => v.id === added.json.id).error, 'VOD introuvable ou non publiée')
  assert.equal((await call(`/api/admin/vods/${added.json.id}/retry`, { method: 'POST' })).status, 200)
  assert.equal((await q(`SELECT status FROM vods WHERE id = $1`, [added.json.id]))[0].status, 'ended')
  await q(`UPDATE vods SET status = 'analyzing' WHERE id = $1`, [added.json.id])
  assert.equal((await call(`/api/admin/vods/${added.json.id}`, { method: 'DELETE' })).status, 409)
  await q(`UPDATE vods SET status = 'ended' WHERE id = $1`, [added.json.id])
  // deplacement vers une autre chaine (meme VOD, autre style / autres photos)
  const other = (await call('/api/admin/test-channels', { method: 'POST', body: { name: 'Cible du deplacement' } })).json.channel.id
  const move = (id, body, who = {}) => call(`/api/admin/vods/${id}/move`, { method: 'POST', body, ...who })
  assert.equal((await move(added.json.id, { channelId: reset.id })).status, 400)
  assert.equal((await move(added.json.id, { channelId })).status, 400)
  assert.equal((await move(added.json.id, { channelId: 'pas-un-uuid' })).status, 400)
  assert.equal((await move(added.json.id, { channelId: '11111111-1111-4111-8111-111111111111' })).status, 404)
  assert.equal((await move(added.json.id, { channelId: other }, pubSession)).status, 401)
  assert.equal((await move(vodId, { channelId: other })).status, 404)
  await q(`UPDATE vods SET status = 'analyzing' WHERE id = $1`, [added.json.id])
  assert.equal((await move(added.json.id, { channelId: other })).status, 409)
  await q(`UPDATE vods SET status = 'ended' WHERE id = $1`, [added.json.id])
  assert.equal((await move(added.json.id, { channelId: other })).status, 200)
  assert.equal((await q(`SELECT channel_id FROM vods WHERE id = $1`, [added.json.id]))[0].channel_id, other)
  assert.equal((await call('/api/admin/vods')).json.vods.find(v => v.id === added.json.id).channelId, other)
  assert.equal((await addVod({ channelId, url: '111111' })).status, 409)
  assert.equal((await move(added.json.id, { channelId })).status, 200)
  ok('deplacement d une VOD : autre chaine seulement (pas la demo, pas la meme), jamais pendant l analyse, admin seulement, le doublon reste refuse')
  assert.equal((await call(`/api/admin/vods/${vodId}`, { method: 'DELETE' })).status, 404)
  assert.equal((await call(`/api/admin/vods/${added.json.id}`, { method: 'DELETE' })).status, 200)
  assert.equal((await call('/api/admin/vods')).json.vods.length, 0)
  ok('liste, relance (seulement apres un echec), retrait (jamais pendant l analyse ni pour une VOD non manuelle)')

  // --- VOD reservee aux abonnes : acceptee en attente, cartes du streamer, deblocage, confirmation
  const sub = await addVod({ channelId, url: '555555' })
  assert.equal(sub.status, 200); assert.equal(sub.json.blocked, true); assert.equal(sub.json.status, 'blocked')
  const [bRow] = await q(`SELECT status, restricted_at, error FROM vods WHERE id = $1`, [sub.json.id])
  assert.equal(bRow.status, 'blocked'); assert.ok(bRow.restricted_at); assert.match(bRow.error, /abonn/)
  assert.equal((await call('/api/admin/vods')).json.vods[0].progress.phase, 'blocked')
  const alertsUrl = `/api/studio/channels/${channelId}/vod-alerts`
  assert.deepEqual((await call(alertsUrl, pubSession)).json.alerts.map(a => a.state), ['blocked'])
  assert.equal((await call(alertsUrl, as(sessionCookie.split('=')[1]))).status, 404)
  assert.equal((await call(alertsUrl, { auth: false })).status, 401)
  const rc = (id, who = pubSession) => call(`/api/studio/vods/${id}/recheck`, { ...who, method: 'POST' })
  assert.equal((await rc(sub.json.id)).json.state, 'restricted')
  assert.equal((await rc(sub.json.id, as(sessionCookie.split('=')[1]))).status, 404)
  const sub2 = await addVod({ channelId, url: '666666' })
  assert.equal(sub2.json.blocked, true)
  assert.equal((await rc(sub2.json.id)).json.state, 'restricted')
  await fetch('http://127.0.0.1:3397/open-666666')
  assert.equal((await rc(sub2.json.id)).json.state, 'readable')
  assert.deepEqual((await q(`SELECT status, error FROM vods WHERE id = $1`, [sub2.json.id]))[0], { status: 'ended', error: null })
  const stateOf = async id => (await call(alertsUrl, pubSession)).json.alerts.find(a => a.id === id)?.state
  assert.equal(await stateOf(sub2.json.id), 'working')
  const ack = (id, who = pubSession) => call(`/api/studio/vods/${id}/ack`, { ...who, method: 'POST' })
  assert.equal((await ack(sub2.json.id)).status, 409)
  await q(`UPDATE vods SET status = 'done', sources_saved_at = now() WHERE id = $1`, [sub2.json.id])
  assert.equal(await stateOf(sub2.json.id), 'restore')
  assert.equal((await ack(sub2.json.id, as(sessionCookie.split('=')[1]))).status, 404)
  assert.equal((await ack(sub2.json.id)).status, 200)
  assert.equal(await stateOf(sub2.json.id), undefined)
  // Essai du parcours avec une VOD publique : entre en attente, repart au test de lecture, puis meme parcours.
  const simulated = await addVod({ channelId, url: '111111', simulateRestricted: true })
  assert.equal(simulated.status, 200); assert.equal(simulated.json.blocked, true)
  assert.equal((await q(`SELECT status FROM vods WHERE id = $1`, [simulated.json.id]))[0].status, 'blocked')
  assert.equal((await call('/api/admin/vods', {})).json.vods.some(v => v.id === simulated.json.id && v.progress.phase === 'blocked'), true)
  assert.equal((await rc(simulated.json.id)).json.state, 'readable')
  assert.equal((await q(`SELECT status FROM vods WHERE id = $1`, [simulated.json.id]))[0].status, 'ended')
  assert.equal((await addVod({ channelId, url: '222222', simulateRestricted: true })).status, 400)
  ok('VOD reservee aux abonnes : acceptee en attente (admin), carte « Action requise » du streamer, verification immediate, deblocage, carte « tu peux la remettre » puis confirmation ; autre chaine = 404')


  // --- « Prochainement » : blocs de vote, totaux caches avant le vote, egalite, cloture, idees
  await q(`INSERT INTO studio_sessions (id, channel_id, token_hash, expires_at) VALUES (gen_random_uuid(), $1, $2, now() + interval '1 day')`, [otherId, sha('jeton-autre-vote')])
  await q(`INSERT INTO studio_sessions (id, channel_id, token_hash, expires_at) VALUES (gen_random_uuid(), $1, $2, now() + interval '1 day')`, [channelId, sha('jeton-vote-a')])
  const voterA = as('jeton-vote-a'); const voterB = as('jeton-autre-vote')
  const rmFeats = Object.fromEntries((await q(`SELECT slug, id FROM roadmap_features`)).map(r => [r.slug, r.id]))
  assert.ok(rmFeats.tiktok && rmFeats.instagram && rmFeats.stats, 'les 3 fonctions de depart existent')
  assert.equal((await call('/api/studio/roadmap', { auth: false })).status, 401)
  const rmNone = await call('/api/studio/roadmap', voterA)
  assert.equal(rmNone.status, 200); assert.equal(rmNone.json.block, null)
  // admin : lancer un bloc (pas deux a la fois, pas la meme fonction deux fois)
  assert.equal((await call('/api/admin/roadmap/blocks', { method: 'POST', body: { featureAId: rmFeats.tiktok, featureBId: rmFeats.tiktok } })).status, 400)
  assert.equal((await call('/api/admin/roadmap/blocks', { ...voterA, method: 'POST', body: { featureAId: rmFeats.tiktok, featureBId: rmFeats.instagram } })).status, 401)
  const rmLaunched = await call('/api/admin/roadmap/blocks', { method: 'POST', body: { featureAId: rmFeats.tiktok, featureBId: rmFeats.instagram, days: 14 } })
  assert.equal(rmLaunched.status, 200)
  assert.equal((await call('/api/admin/roadmap/blocks', { method: 'POST', body: { featureAId: rmFeats.stats, featureBId: rmFeats.tiktok } })).status, 409)
  const rmBlock = rmLaunched.json.id
  // avant le vote : pas de totaux
  const rmBefore = await call('/api/studio/roadmap', voterA)
  assert.equal(rmBefore.json.block.totals, null); assert.equal(rmBefore.json.block.myVote, null)
  // vote, puis changement de vote : un seul vote par chaine
  assert.equal((await call('/api/studio/roadmap/vote', { ...voterA, method: 'POST', body: { blockId: rmBlock, featureId: rmFeats.stats } })).status, 400)
  assert.equal((await call('/api/studio/roadmap/vote', { ...voterA, method: 'POST', body: { blockId: rmBlock, featureId: rmFeats.tiktok } })).status, 200)
  assert.equal((await call('/api/studio/roadmap/vote', { ...voterA, method: 'POST', body: { blockId: rmBlock, featureId: rmFeats.instagram } })).status, 200)
  assert.equal((await q(`SELECT count(*)::int AS n FROM roadmap_votes WHERE block_id = $1`, [rmBlock]))[0].n, 1)
  const rmVoted = await call("/api/studio/roadmap", voterA)
  assert.equal(rmVoted.json.block.myVote, rmFeats.instagram); assert.equal(rmVoted.json.block.totals[rmFeats.instagram], 1); assert.equal(rmVoted.json.block.totals[rmFeats.tiktok], 0)
  // l'autre chaine ne voit pas les totaux tant qu'elle n'a pas vote ; l'admin voit les siens
  assert.equal((await call('/api/studio/roadmap', voterB)).json.block.totals, null)
  assert.equal((await call('/api/studio/roadmap/vote', { ...voterB, method: 'POST', body: { blockId: rmBlock, featureId: rmFeats.tiktok } })).status, 200)
  // idees : texte trop court refuse, valide accepte, 5 par jour
  assert.equal((await call('/api/studio/roadmap/idea', { ...voterA, method: 'POST', body: { text: 'ab' } })).status, 400)
  for (let i = 0; i < 5; i++) assert.equal((await call('/api/studio/roadmap/idea', { ...voterA, method: 'POST', body: { text: `Une idee numero ${i} pour Clippeak` } })).status, 200)
  assert.equal((await call('/api/studio/roadmap/idea', { ...voterA, method: 'POST', body: { text: 'Une sixieme idee du jour' } })).status, 429)
  const rmAdmin = await call('/api/admin/roadmap')
  assert.equal(rmAdmin.status, 200); assert.equal(rmAdmin.json.ideas.length, 5)
  assert.equal(rmAdmin.json.blocks[0].a.total + rmAdmin.json.blocks[0].b.total, 2)
  assert.equal((await call('/api/admin/roadmap', voterA)).status, 401)
  // egalite 1-1 : echeance passee => l'admin doit trancher
  await q(`UPDATE roadmap_blocks SET ends_at = (now() at time zone 'utc') - interval '1 minute' WHERE id = $1`, [rmBlock])
  assert.equal((await call('/api/studio/roadmap/vote', { ...voterA, method: 'POST', body: { blockId: rmBlock, featureId: rmFeats.tiktok } })).status, 409)
  const rmTied = await call('/api/studio/roadmap', voterA)
  assert.equal(rmTied.json.block.tied, true)
  assert.equal((await call(`/api/admin/roadmap/blocks/${rmBlock}/close`, { method: 'POST', body: {} })).status, 409)
  assert.equal((await call(`/api/admin/roadmap/blocks/${rmBlock}/close`, { method: 'POST', body: { featureId: rmFeats.tiktok } })).status, 200)
  const [tk, ig] = [(await q(`SELECT status, carried_votes FROM roadmap_features WHERE id = $1`, [rmFeats.tiktok]))[0], (await q(`SELECT status, carried_votes FROM roadmap_features WHERE id = $1`, [rmFeats.instagram]))[0]]
  assert.equal(tk.status, 'building'); assert.equal(ig.status, 'backlog'); assert.equal(ig.carried_votes, 1)
  // resultat a annoncer : la chaine qui avait vote pour la perdante le voit, puis plus apres « vu »
  const rmNotice = await call('/api/studio/roadmap', voterA)
  assert.equal(rmNotice.json.notice.won, false); assert.equal((await call('/api/studio/roadmap', voterB)).json.notice.won, true)
  assert.equal((await call('/api/studio/roadmap/seen', { ...voterA, method: 'POST', body: { blockId: rmBlock } })).status, 200)
  assert.equal((await call('/api/studio/roadmap', voterA)).json.notice, null)
  // 2e bloc : la perdante revient avec ses votes conserves ; la plus votee gagne seule a l'echeance
  const rmSecond = await call('/api/admin/roadmap/blocks', { method: 'POST', body: { featureAId: rmFeats.instagram, featureBId: rmFeats.stats, days: 7 } })
  assert.equal(rmSecond.status, 200)
  assert.equal((await call('/api/studio/roadmap/vote', { ...voterA, method: 'POST', body: { blockId: rmSecond.json.id, featureId: rmFeats.stats } })).status, 200)
  assert.equal((await call('/api/studio/roadmap', voterA)).json.block.totals[rmFeats.instagram], 1)
  await q(`UPDATE roadmap_blocks SET ends_at = (now() at time zone 'utc') - interval '1 minute' WHERE id = $1`, [rmSecond.json.id])
  await call('/api/studio/roadmap', voterA)
  assert.equal((await q(`SELECT winner_id, decided_by, status FROM roadmap_blocks WHERE id = $1`, [rmSecond.json.id]))[0].status, 'needs_admin')
  assert.equal((await call(`/api/admin/roadmap/features/${rmFeats.tiktok}`, { method: 'PATCH', body: { status: 'delivered' } })).status, 200)
  assert.equal((await call('/api/studio/roadmap', voterA)).json.delivered.length, 1)
  ok('prochainement : bloc unique, un vote par chaine (modifiable), totaux caches avant le vote, egalite = l admin tranche, perdante gardee avec ses votes, resultat annonce puis acquitte, idees limitees a 5/jour, livre affiche')



  // --- cloche : chaque chaine recoit le vote lance, son resultat (selon son vote) et le statut livre ; lecture ; cloisonnement
  const nA = await call('/api/studio/notifications', voterA)
  assert.equal(nA.status, 200)
  const titlesA = nA.json.items.map(i => i.title)
  assert.ok(titlesA.includes('Nouveau vote : à toi de choisir'), 'vote lance')
  assert.ok(titlesA.includes('Résultat du vote'), 'A avait vote pour la perdante')
  assert.ok(titlesA.includes('Une fonction est livrée'), 'statut livre')
  assert.ok((await call('/api/studio/notifications', voterB)).json.items.some(i => i.title === 'Ton vote a gagné'), 'B avait vote pour la gagnante')
  assert.ok(nA.json.unread >= 3)
  assert.equal((await call('/api/studio/notifications', { auth: false })).status, 401)
  assert.equal((await call('/api/studio/notifications/read', { ...voterA, method: 'POST', body: {} })).status, 200)
  assert.equal((await call('/api/studio/notifications', voterA)).json.unread, 0)
  assert.ok((await call('/api/studio/notifications', voterB)).json.unread > 0, 'lire les siennes ne touche pas celles des autres')
  ok('cloche : vote lance, resultat selon le vote, fonction livree ; lues a l ouverture ; chaque chaine ne voit que les siennes')

  console.log('API_IT_OK')
} catch (error) {
  failure = error
  console.log('ECHEC :', String(error.message ?? error).slice(0, 300), '| derniere reponse :', JSON.stringify(last))
} finally {
  server.kill()
  fakeTwitch.close()
  await socket.stop().catch(() => {})
  await db.close().catch(() => {})
  process.exit(failure ? 1 : 0)
}
