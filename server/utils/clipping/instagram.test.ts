import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { PublishError, instagramCaption } from './publishing.ts'
import { runPublishOnce } from './publishQueue.ts'
import type { DuePublication, PublishStore } from './publishQueue.ts'
import { buildInstagramAuthUrl, classifyInstagramError, exchangeInstagramCode, fetchInstagramAccounts, fetchInstagramProfile, instagramTokenExpired, parseInstagramSignedRequest } from './instagramApi.ts'
import { instagramVideoUrl, verifyInstagramVideoToken } from './instagramMedia.ts'
import { createInstagramPublisher } from './instagramPublisher.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const day = 86_400_000
const input = (over: Record<string, unknown> = {}) => ({ clipId: 'clip-1', accountId: 'ig-1', title: 'T', caption: 'Ma légende #twitch', hashtags: '', videoPath: '/clip.mp4', options: null, refreshToken: 'tok', accessToken: 'tok', expiresAt: new Date(Date.now() + 59 * day), ...over })

// Faux Meta : enregistre les appels et rejoue des statuts de conteneur dans l'ordre.
function fakeMeta(opts: { statuses?: string[], containerError?: { status: number, body: unknown }, publishError?: { status: number, body: unknown } } = {}) {
  const calls: Array<{ url: string, method: string, body: string, auth: string }> = []
  let poll = 0
  const fetchFn = (async (url: string, init: any = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? String(init.body) : '', auth: init.headers?.authorization ?? '' })
    if (url.endsWith('/ig-1/media')) return opts.containerError ? json(opts.containerError.body, opts.containerError.status) : json({ id: 'cont-1' })
    if (url.includes('/cont-1?')) { const list = opts.statuses ?? ['IN_PROGRESS', 'FINISHED']; return json({ status_code: list[Math.min(poll++, list.length - 1)] }) }
    if (url.endsWith('/ig-1/media_publish')) return opts.publishError ? json(opts.publishError.body, opts.publishError.status) : json({ id: 'media-9' })
    if (url.includes('/media-9?')) return json({ permalink: 'https://www.instagram.com/reel/abc/' })
    return json({}, 404)
  }) as unknown as typeof fetch
  return { fetchFn, calls }
}
const publisher = (fetchFn: typeof fetch, extra: Record<string, unknown> = {}) => createInstagramPublisher({ videoUrlFor: id => `https://clippeak.test/api/media/instagram/${id}?t=x`, fetchFn, fileSize: async () => 1000, sleep: async () => {}, statusIntervalMs: 1, ...extra })

test('buildInstagramAuthUrl opens the Meta login dialog with the configuration and carries the state', () => {
  const url = new URL(buildInstagramAuthUrl({ appId: '123', configId: '456', redirectUri: 'https://clippeak.sassify.fr/api/auth/instagram/callback', state: 'abc' }))
  assert.equal(url.origin + url.pathname, 'https://www.facebook.com/dialog/oauth')
  assert.equal(url.searchParams.get('config_id'), '456')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('client_id'), '123')
  assert.equal(url.searchParams.get('state'), 'abc')
  assert.equal(url.searchParams.get('scope'), null)
  assert.equal(url.searchParams.get('override_default_response_type'), 'true')
  assert.equal(url.searchParams.get('prompt'), 'login')
})

test('exchangeInstagramCode swaps the code for the business token, with or without an expiry', async () => {
  const calls: string[] = []
  const make = (body: unknown) => (async (url: string, init: any = {}) => {
    calls.push(`${init.method ?? 'GET'} ${url.split('?')[0]}`)
    return json(body)
  }) as unknown as typeof fetch
  const never = await exchangeInstagramCode(make({ access_token: 'suat' }), { appId: 'a', appSecret: 's', code: 'c', redirectUri: 'r' })
  assert.deepEqual([never.accessToken, never.expiresAt], ['suat', null])
  const dated = await exchangeInstagramCode(make({ access_token: 'suat', expires_in: 3600 }), { appId: 'a', appSecret: 's', code: 'c', redirectUri: 'r', now: () => 0 })
  assert.equal(dated.expiresAt?.getTime(), 3600 * 1000)
  assert.deepEqual(calls, ['GET https://graph.facebook.com/v27.0/oauth/access_token', 'GET https://graph.facebook.com/v27.0/oauth/access_token'])
  await assert.rejects(exchangeInstagramCode(make({}), { appId: 'a', appSecret: 's', code: 'c', redirectUri: 'r' }), /pas renvoyé de jeton/)
})

test('errors never leak the app secret or a token', async () => {
  const fail = (async () => json({ error_type: 'OAuthException', code: 400, error_message: 'Matching code was not found or was already used' }, 400)) as unknown as typeof fetch
  await assert.rejects(exchangeInstagramCode(fail, { appId: 'a', appSecret: 'SUPERSECRET', code: 'c', redirectUri: 'r' }), (e: Error) => !e.message.includes('SUPERSECRET') && /already used/.test(e.message))
  await assert.rejects(exchangeInstagramCode((async () => { throw new Error('boom SUPERSECRET') }) as unknown as typeof fetch, { appId: 'a', appSecret: 'SUPERSECRET', code: 'c', redirectUri: 'r' }), (e: Error) => !e.message.includes('SUPERSECRET'))
})

test('fetchInstagramProfile takes the first shared Instagram account, or null when none was shared', async () => {
  const urls: string[] = []
  const make = (body: unknown) => (async (url: string) => { urls.push(url); return json(body) }) as unknown as typeof fetch
  assert.deepEqual(await fetchInstagramProfile(make({ data: [{ id: '77', username: 'streamer' }, { id: '78', username: 'autre' }] }), 'tok'), { userId: '77', username: 'streamer' })
  assert.ok(urls[0]!.startsWith('https://graph.facebook.com/v27.0/me/assigned_instagram_accounts?'))
  assert.equal(await fetchInstagramProfile(make({ data: [] }), 'tok'), null)
})

test('fetchInstagramAccounts lists every assigned account, skipping entries without an id', async () => {
  const make = (body: unknown) => (async () => json(body)) as unknown as typeof fetch
  assert.deepEqual(await fetchInstagramAccounts(make({ data: [{ id: '77', username: 'a' }, { username: 'sans-id' }, { id: '78', username: 'b' }] }), 'tok'), [{ userId: '77', username: 'a' }, { userId: '78', username: 'b' }])
  assert.deepEqual(await fetchInstagramAccounts(make({}), 'tok'), [])
})

test('instagramTokenExpired: a token without expiry never expires, a past date does', () => {
  const now = 1_000_000_000_000
  assert.equal(instagramTokenExpired(null, now), false)
  assert.equal(instagramTokenExpired(new Date(now - 1), now), true)
  assert.equal(instagramTokenExpired(new Date(now + day), now), false)
})

test('classifyInstagramError sorts Meta errors into the four useful families', () => {
  assert.equal(classifyInstagramError(400, { error: { code: 190, message: 'expired' } }).kind, 'auth')
  assert.equal(classifyInstagramError(400, { error: { code: 10, message: 'perm' } }).kind, 'auth')
  assert.equal(classifyInstagramError(400, { error: { code: 4, message: 'limit' } }).kind, 'quota')
  assert.equal(classifyInstagramError(503, {}).kind, 'transient')
  assert.equal(classifyInstagramError(400, { error: { code: 100, message: 'bad param', is_transient: true } }).kind, 'transient')
  assert.equal(classifyInstagramError(400, { error: { code: 100, message: 'bad param' } }).kind, 'rejected')
})

test('signed video links are bound to one clip and expire', () => {
  const key = Buffer.alloc(32, 7)
  const url = new URL(instagramVideoUrl('https://clippeak.sassify.fr/', 'clip-1', key, 1000))
  assert.equal(url.pathname, '/api/media/instagram/clip-1')
  const token = url.searchParams.get('t')!
  assert.ok(verifyInstagramVideoToken(key, 'clip-1', token, 2000))
  assert.ok(!verifyInstagramVideoToken(key, 'clip-2', token, 2000))
  assert.ok(!verifyInstagramVideoToken(key, 'clip-1', token, 1000 + 3 * 3600_000))
  assert.ok(!verifyInstagramVideoToken(Buffer.alloc(32, 8), 'clip-1', token, 2000))
})

test('parseInstagramSignedRequest accepts only a payload signed with the app secret', () => {
  const payload = Buffer.from(JSON.stringify({ user_id: '55', algorithm: 'HMAC-SHA256' })).toString('base64url')
  const sig = createHmac('sha256', 'sec').update(payload).digest('base64url')
  assert.equal(parseInstagramSignedRequest(`${sig}.${payload}`, 'sec')?.user_id, '55')
  assert.equal(parseInstagramSignedRequest(`${sig}.${payload}`, 'autre'), null)
  assert.equal(parseInstagramSignedRequest(`${sig}x.${payload}`, 'sec'), null)
  assert.equal(parseInstagramSignedRequest('nimportequoi', 'sec'), null)
})

test('instagramCaption strips angle brackets, keeps 30 hashtags and 2200 characters', () => {
  assert.equal(instagramCaption('Salut <b>#gta6</b>'), 'Salut b#gta6/b')
  const many = Array.from({ length: 35 }, (_, i) => `#t${i}`).join(' ')
  assert.equal(instagramCaption(many).match(/#/g)!.length, 30)
  assert.ok(instagramCaption('a'.repeat(3000)).length <= 2200)
})

test('publisher: container with the signed video URL, waits for processing, publishes, returns the permalink', async () => {
  const meta = fakeMeta()
  const result = await publisher(meta.fetchFn).publish(input({ options: { caption: 'Ma légende #gta6' } }) as any)
  assert.deepEqual([result.externalId, result.url], ['media-9', 'https://www.instagram.com/reel/abc/'])
  const create = meta.calls.find(c => c.url.endsWith('/ig-1/media'))!
  const form = new URLSearchParams(create.body)
  assert.deepEqual([form.get('media_type'), form.get('video_url'), form.get('caption'), form.get('share_to_feed')], ['REELS', 'https://clippeak.test/api/media/instagram/clip-1?t=x', 'Ma légende #gta6', 'true'])
  assert.equal(create.auth, 'Bearer tok')
  assert.equal(new URLSearchParams(meta.calls.find(c => c.url.endsWith('/media_publish'))!.body).get('creation_id'), 'cont-1')
  assert.equal(result.accessToken, undefined)
})

test('publisher: falls back to the clip caption, never renews, and an expired token asks to reconnect', async () => {
  const meta = fakeMeta()
  const result = await publisher(meta.fetchFn).publish(input({ expiresAt: new Date(Date.now() + 20 * day) }) as any)
  assert.equal(new URLSearchParams(meta.calls.find(c => c.url.endsWith('/ig-1/media'))!.body).get('caption'), 'Ma légende #twitch')
  assert.equal(result.accessToken, undefined)
  assert.equal(meta.calls.find(c => c.url.endsWith('/ig-1/media'))!.auth, 'Bearer tok')
  assert.ok(!meta.calls.some(c => c.url.includes('refresh')))
  const never = await publisher(meta.fetchFn).publish(input({ expiresAt: null }) as any)
  assert.equal(never.externalId, 'media-9')
  await assert.rejects(publisher(meta.fetchFn).publish(input({ expiresAt: new Date(Date.now() - 1000) }) as any), (e: PublishError) => e.kind === 'auth' && /Reconnecte/.test(e.message))
  await assert.rejects(publisher(meta.fetchFn).publish(input({ accountId: null }) as any), (e: PublishError) => e.kind === 'auth')
})

test('publisher: processing error and timeout publish nothing; the timeout can be retried', async () => {
  const bad = fakeMeta({ statuses: ['ERROR'] })
  await assert.rejects(publisher(bad.fetchFn).publish(input() as any), (e: PublishError) => e.kind === 'rejected' && /traiter la vidéo/.test(e.message))
  assert.ok(!bad.calls.some(c => c.url.endsWith('/media_publish')))
  let t = 0
  const slow = fakeMeta({ statuses: ['IN_PROGRESS'] })
  await assert.rejects(publisher(slow.fetchFn, { now: () => (t += 100_000), statusTimeoutMs: 250_000 }).publish(input() as any), (e: PublishError) => e.kind === 'transient')
  assert.ok(!slow.calls.some(c => c.url.endsWith('/media_publish')))
})

test('publisher: never retries once publish was requested without a clear answer; real API refusals keep their family', async () => {
  const lost = fakeMeta({ publishError: { status: 500, body: {} } })
  await assert.rejects(publisher(lost.fetchFn).publish(input() as any), (e: PublishError) => e.kind === 'rejected' && /vérifie sur ton compte/.test(e.message))
  const quota = fakeMeta({ containerError: { status: 400, body: { error: { code: 4, message: 'x' } } } })
  await assert.rejects(publisher(quota.fetchFn).publish(input() as any), (e: PublishError) => e.kind === 'quota')
  await assert.rejects(createInstagramPublisher({ videoUrlFor: () => 'u', fetchFn: fakeMeta().fetchFn, fileSize: async () => 301 * 1024 * 1024 }).publish(input() as any), /trop lourd/)
})

test('runPublishOnce passes the clip and the Instagram account id to the publisher', async () => {
  const saved: unknown[] = []
  const done: unknown[] = []
  const due: DuePublication = { id: 'p1', platform: 'instagram', attempts: 0, options: { caption: 'x' }, clip: { id: 'clip-1', title: 'T', caption: 'C', hashtags: '', videoPath: '/c.mp4', status: 'approved' }, connection: { id: 'conn-1', externalId: 'ig-1', refreshToken: 'tok', accessToken: 'tok', expiresAt: new Date(Date.now() + 20 * day) } }
  let first = true
  const store: PublishStore = {
    requeueInterrupted: async () => 0,
    claimDue: async () => { if (!first) return null; first = false; return due },
    saveAccessToken: async (_id, token) => { saved.push(token) },
    markPublished: async (_id, result) => { done.push(result) },
    markFailed: async () => { throw new Error('should not fail') }
  }
  const meta = fakeMeta()
  assert.equal(await runPublishOnce({ store, publishers: { instagram: publisher(meta.fetchFn) } }), true)
  assert.equal(done.length, 1)
  assert.deepEqual([(done[0] as { externalId: string }).externalId, (done[0] as { url: string }).url], ['media-9', 'https://www.instagram.com/reel/abc/'])
  assert.equal(saved.length, 0)
  assert.ok(meta.calls.some(c => c.url.endsWith('/ig-1/media')))
})
