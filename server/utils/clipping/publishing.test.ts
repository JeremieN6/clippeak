import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { decryptToken, encryptToken, parseKey } from './tokenVault.ts'
import { suggestSlots, youtubeMetadata, PublishError } from './publishing.ts'
import { createYoutubePublisher } from './youtubePublisher.ts'
import { MAX_ATTEMPTS, runPublishOnce } from './publishQueue.ts'
import { buildGoogleAuthUrl, exchangeGoogleCode, YOUTUBE_UPLOAD_SCOPE } from './googleOAuth.ts'
import type { DuePublication, PublishStore } from './publishQueue.ts'

test('token vault round-trips, never stores the clear text and rejects tampering or a wrong key', () => {
  const key = parseKey(randomBytes(32).toString('base64'))
  const stored = encryptToken('1//refresh-secret', key)
  assert.ok(!stored.includes('refresh-secret'))
  assert.equal(decryptToken(stored, key), '1//refresh-secret')
  assert.notEqual(encryptToken('1//refresh-secret', key), stored)
  const parts = stored.split('.')
  parts[3] = parts[3].replace(/.$/, c => (c === 'A' ? 'B' : 'A'))
  assert.throws(() => decryptToken(parts.join('.'), key))
  assert.throws(() => decryptToken(stored, parseKey(randomBytes(32).toString('base64'))))
  assert.throws(() => parseKey(undefined))
  assert.throws(() => parseKey('trop-court'))
})

test('youtubeMetadata keeps the title within 100 characters and tags the video as a Short', () => {
  const long = youtubeMetadata('A'.repeat(300), 'Légende <b>drôle</b>', '#twitch  #fail #shorts')
  assert.ok(long.title.length <= 100)
  assert.ok(long.title.endsWith('#Shorts'))
  assert.ok(!long.description.includes('<'))
  assert.equal(long.description.split('\n\n')[1], '#twitch #fail #Shorts')
  const short = youtubeMetadata('Le saut raté', '', '')
  assert.equal(short.title, 'Le saut raté #Shorts')
  assert.equal(short.description, '#Shorts')
})

test('suggestSlots proposes the next preferred times, in the future, skipping taken slots', () => {
  const now = new Date(2026, 9, 28, 13, 0)
  const slots = suggestSlots(now, ['12:30', '18:30', '21:00'], 3)
  assert.deepEqual(slots.map(s => s.getDate() + ' ' + s.getHours() + ':' + s.getMinutes()), ['28 18:30', '28 21:0', '29 12:30'])
  const taken = suggestSlots(now, ['12:30', '18:30', '21:00'], 1)
  const next = suggestSlots(now, ['12:30', '18:30', '21:00'], 2, taken)
  assert.equal(next[0].getHours(), 21)
  assert.deepEqual(suggestSlots(new Date(2026, 9, 28, 18, 20), ['18:30'], 1).map(s => s.getDate()), [29])
  assert.deepEqual(suggestSlots(now, ['pas une heure', '25:00'], 3), [])
})

function fakeGoogle(overrides: { token?: () => Response, start?: () => Response, upload?: () => Response } = {}) {
  const calls: Array<{ url: string, method: string, headers: Record<string, string>, body?: any }> = []
  const fetchFn = (async (url: any, init: any = {}) => {
    const u = String(url)
    calls.push({ url: u, method: init.method ?? 'GET', headers: Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)])), body: init.body })
    if (u.includes('token')) return overrides.token?.() ?? Response.json({ access_token: 'new-access', expires_in: 3600 })
    if (u.includes('uploadType=resumable')) return overrides.start?.() ?? new Response('{}', { status: 200, headers: { location: 'https://upload.example/session-1' } })
    if (u.startsWith('https://upload.example')) return overrides.upload?.() ?? Response.json({ id: 'VID123' })
    return new Response('?', { status: 404 })
  }) as typeof fetch
  return { fetchFn, calls }
}
const input = { title: 'Mon clip', caption: 'légende', hashtags: '#twitch', videoPath: '/data/clip.mp4', refreshToken: 'refresh', accessToken: null, expiresAt: null }
const readVideo = async () => Buffer.from('video-bytes')

test('youtube publisher refreshes the access token, uploads in two steps and returns the Shorts link', async () => {
  const { fetchFn, calls } = fakeGoogle()
  const publisher = createYoutubePublisher({ clientId: 'id', clientSecret: 'secret', fetchFn, readVideo, now: () => 0 })
  const result = await publisher.publish(input)
  assert.equal(result.externalId, 'VID123')
  assert.equal(result.url, 'https://www.youtube.com/shorts/VID123')
  assert.equal(result.accessToken?.value, 'new-access')
  assert.deepEqual(calls.map(c => c.method), ['POST', 'POST', 'PUT'])
  assert.equal(calls[1].headers.authorization, 'Bearer new-access')
  assert.equal(calls[1].headers['x-upload-content-length'], String('video-bytes'.length))
  assert.equal(JSON.parse(calls[1].body).snippet.title, 'Mon clip #Shorts')
  assert.ok(String(calls[0].body).includes('grant_type=refresh_token'))
})

test('youtube publisher reuses a valid access token without calling the token endpoint', async () => {
  const { fetchFn, calls } = fakeGoogle()
  const publisher = createYoutubePublisher({ clientId: 'id', clientSecret: 'secret', fetchFn, readVideo, now: () => 0 })
  const result = await publisher.publish({ ...input, accessToken: 'still-good', expiresAt: new Date(10 * 60_000) })
  assert.equal(result.accessToken, undefined)
  assert.equal(calls.some(c => c.url.includes('token')), false)
  assert.equal(calls[0].headers.authorization, 'Bearer still-good')
})

test('youtube publisher classifies errors: reconnect, quota, rejected, transient', async () => {
  const run = (overrides: Parameters<typeof fakeGoogle>[0]) => createYoutubePublisher({ clientId: 'id', clientSecret: 'secret', fetchFn: fakeGoogle(overrides).fetchFn, readVideo, now: () => 0 }).publish(input).then(() => null, e => e as PublishError)
  assert.equal((await run({ token: () => Response.json({ error: 'invalid_grant' }, { status: 400 }) }))?.kind, 'auth')
  assert.equal((await run({ start: () => Response.json({ error: { errors: [{ reason: 'quotaExceeded' }], message: 'quota' } }, { status: 403 }) }))?.kind, 'quota')
  assert.equal((await run({ start: () => Response.json({ error: { message: 'bad' } }, { status: 400 }) }))?.kind, 'rejected')
  assert.equal((await run({ upload: () => new Response('boom', { status: 503 }) }))?.kind, 'transient')
  assert.equal((await run({ start: () => new Response('{}', { status: 200 }) }))?.kind, 'transient')
  const missing = await createYoutubePublisher({ clientId: 'id', clientSecret: 'secret', fetchFn: fakeGoogle().fetchFn, readVideo: async () => { throw new Error('ENOENT') }, now: () => 0 }).publish(input).catch(e => e)
  assert.equal(missing.kind, 'rejected')
})

function memoryStore(due: DuePublication | null) {
  const log: string[] = []
  let queue = due
  const store: PublishStore = {
    requeueInterrupted: async () => 0,
    claimDue: async () => { const d = queue; queue = null; return d },
    saveAccessToken: async (id, t) => { log.push(`token:${id}:${t.value}`) },
    markPublished: async (id, r) => { log.push(`published:${id}:${r.externalId}`) },
    markFailed: async (id, error, retryAt) => { log.push(`failed:${id}:${retryAt ? 'retry' : 'final'}:${error}`) }
  }
  return { store, log }
}
const duePub = (patch: Partial<DuePublication> = {}): DuePublication => ({
  id: 'p1', platform: 'youtube', attempts: 0,
  clip: { id: 'c1', title: 'T', caption: 'C', hashtags: '#a', videoPath: '/x.mp4', status: 'approved' },
  connection: { id: 'k1', refreshToken: 'r', accessToken: null, expiresAt: null },
  ...patch
})
const okPublisher = { platform: 'youtube' as const, publish: async () => ({ externalId: 'V', url: 'u', accessToken: { value: 'a', expiresAt: new Date(0) } }) }

test('publish queue: nothing due means nothing happens', async () => {
  const { store, log } = memoryStore(null)
  assert.equal(await runPublishOnce({ store, publishers: { youtube: okPublisher } }), false)
  assert.deepEqual(log, [])
})

test('publish queue: publishes a due clip and keeps the renewed access token', async () => {
  const { store, log } = memoryStore(duePub())
  assert.equal(await runPublishOnce({ store, publishers: { youtube: okPublisher } }), true)
  assert.deepEqual(log, ['token:k1:a', 'published:p1:V'])
})

test('publish queue: never publishes a clip that is no longer approved, has no video or no connection', async () => {
  for (const patch of [
    { clip: { ...duePub().clip, status: 'rejected' } },
    { clip: { ...duePub().clip, videoPath: null } },
    { connection: null },
    { connection: { id: 'k1', refreshToken: null, accessToken: null, expiresAt: null } },
    { platform: 'tiktok' }
  ] as Array<Partial<DuePublication>>) {
    let called = false
    const { store, log } = memoryStore(duePub(patch))
    await runPublishOnce({ store, publishers: { youtube: { platform: 'youtube', publish: async () => { called = true; return { externalId: 'x', url: 'x' } } } } })
    assert.equal(called, false)
    assert.ok(log[0].startsWith('failed:p1:final:'), log[0])
  }
})

test('publish queue: transient errors are retried up to the limit, other errors fail at once', async () => {
  const failing = (kind: any) => ({ platform: 'youtube' as const, publish: async () => { throw new PublishError(kind, 'oups') } })
  let r = memoryStore(duePub())
  await runPublishOnce({ store: r.store, publishers: { youtube: failing('transient') } })
  assert.equal(r.log[0], 'failed:p1:retry:oups')
  r = memoryStore(duePub({ attempts: MAX_ATTEMPTS - 1 }))
  await runPublishOnce({ store: r.store, publishers: { youtube: failing('transient') } })
  assert.equal(r.log[0], 'failed:p1:final:oups')
  r = memoryStore(duePub())
  await runPublishOnce({ store: r.store, publishers: { youtube: failing('auth') } })
  assert.equal(r.log[0], 'failed:p1:final:oups')
  r = memoryStore(duePub())
  await runPublishOnce({ store: r.store, publishers: { youtube: { platform: 'youtube', publish: async () => { throw new Error('bug') } } } })
  assert.equal(r.log[0], 'failed:p1:retry:Erreur inattendue pendant la publication.')
})

test('google auth url asks for the minimal scope, offline access and carries the state', () => {
  const url = new URL(buildGoogleAuthUrl({ clientId: 'cid', redirectUri: 'https://x.example/cb', state: 'abc' }))
  assert.equal(url.searchParams.get('scope'), YOUTUBE_UPLOAD_SCOPE)
  assert.equal(url.searchParams.get('access_type'), 'offline')
  assert.equal(url.searchParams.get('prompt'), 'consent')
  assert.equal(url.searchParams.get('state'), 'abc')
  assert.equal(url.searchParams.get('redirect_uri'), 'https://x.example/cb')
})

test('exchangeGoogleCode needs the access, the refresh token and the upload right; errors never contain a secret', async () => {
  const base = { clientId: 'cid', clientSecret: 'S3CRET', code: 'c', redirectUri: 'r', now: () => 0 }
  const reply = (body: unknown, status = 200) => (async () => Response.json(body, { status })) as unknown as typeof fetch
  const tokens = await exchangeGoogleCode(reply({ access_token: 'a', refresh_token: 'r', expires_in: 100, scope: YOUTUBE_UPLOAD_SCOPE }), base)
  assert.equal(tokens.expiresAt.getTime(), 100_000)
  await assert.rejects(exchangeGoogleCode(reply({ access_token: 'a', scope: YOUTUBE_UPLOAD_SCOPE }), base), /renouvellement/)
  await assert.rejects(exchangeGoogleCode(reply({ access_token: 'a', refresh_token: 'r', scope: 'openid' }), base), /publier/)
  await assert.rejects(exchangeGoogleCode(reply({ error: 'x' }, 400), base), (e: Error) => !e.message.includes('S3CRET') && /400/.test(e.message))
})
