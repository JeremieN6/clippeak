import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { PublishError, instagramCaption } from './publishing.ts'
import { runPublishOnce } from './publishQueue.ts'
import type { DuePublication, PublishStore } from './publishQueue.ts'
import { buildInstagramAuthUrl, classifyInstagramError, exchangeInstagramCode, fetchInstagramProfile, instagramRefreshDue, isProfessionalAccount, parseInstagramSignedRequest, refreshInstagramToken } from './instagramApi.ts'
import { instagramVideoUrl, verifyInstagramVideoToken } from './instagramMedia.ts'
import { createInstagramPublisher } from './instagramPublisher.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const day = 86_400_000
const input = (over: Record<string, unknown> = {}) => ({ clipId: 'clip-1', accountId: 'ig-1', title: 'T', caption: 'Ma légende #twitch', hashtags: '', videoPath: '/clip.mp4', options: null, refreshToken: 'tok', accessToken: 'tok', expiresAt: new Date(Date.now() + 59 * day), ...over })

// Faux Meta : enregistre les appels et rejoue des statuts de conteneur dans l'ordre.
function fakeMeta(opts: { statuses?: string[], containerError?: { status: number, body: unknown }, publishError?: { status: number, body: unknown }, refreshFails?: boolean } = {}) {
  const calls: Array<{ url: string, method: string, body: string, auth: string }> = []
  let poll = 0
  const fetchFn = (async (url: string, init: any = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? String(init.body) : '', auth: init.headers?.authorization ?? '' })
    if (url.includes('/refresh_access_token')) return opts.refreshFails ? json({ error: { code: 190, message: 'x' } }, 400) : json({ access_token: 'tok-new', token_type: 'bearer', expires_in: 5183944 })
    if (url.endsWith('/ig-1/media')) return opts.containerError ? json(opts.containerError.body, opts.containerError.status) : json({ id: 'cont-1' })
    if (url.includes('/cont-1?')) { const list = opts.statuses ?? ['IN_PROGRESS', 'FINISHED']; return json({ status_code: list[Math.min(poll++, list.length - 1)] }) }
    if (url.endsWith('/ig-1/media_publish')) return opts.publishError ? json(opts.publishError.body, opts.publishError.status) : json({ id: 'media-9' })
    if (url.includes('/media-9?')) return json({ permalink: 'https://www.instagram.com/reel/abc/' })
    return json({}, 404)
  }) as unknown as typeof fetch
  return { fetchFn, calls }
}
const publisher = (fetchFn: typeof fetch, extra: Record<string, unknown> = {}) => createInstagramPublisher({ videoUrlFor: id => `https://clippeak.test/api/media/instagram/${id}?t=x`, fetchFn, fileSize: async () => 1000, sleep: async () => {}, statusIntervalMs: 1, ...extra })

test('buildInstagramAuthUrl asks only for the two scopes Clippeak needs and carries the state', () => {
  const url = new URL(buildInstagramAuthUrl({ appId: '123', redirectUri: 'https://clippeak.sassify.fr/api/auth/instagram/callback', state: 'abc' }))
  assert.equal(url.origin + url.pathname, 'https://www.instagram.com/oauth/authorize')
  assert.equal(url.searchParams.get('scope'), 'instagram_business_basic,instagram_business_content_publish')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('client_id'), '123')
  assert.equal(url.searchParams.get('state'), 'abc')
})

test('exchangeInstagramCode swaps the code for a 60-day token and refuses a missing publish right', async () => {
  const calls: string[] = []
  const make = (permissions: string) => (async (url: string, init: any = {}) => {
    calls.push(`${init.method ?? 'GET'} ${url.split('?')[0]}`)
    if (url.endsWith('/oauth/access_token')) return json({ data: [{ access_token: 'short', user_id: 1020, permissions }] })
    return json({ access_token: 'long', token_type: 'bearer', expires_in: 5183944 })
  }) as unknown as typeof fetch
  const tokens = await exchangeInstagramCode(make('instagram_business_basic,instagram_business_content_publish'), { appId: 'a', appSecret: 's', code: 'c', redirectUri: 'r', now: () => 0 })
  assert.deepEqual([tokens.accessToken, tokens.userId, tokens.expiresAt.getTime()], ['long', '1020', 5183944 * 1000])
  assert.deepEqual(calls, ['POST https://api.instagram.com/oauth/access_token', 'GET https://graph.instagram.com/access_token'])
  await assert.rejects(exchangeInstagramCode(make('instagram_business_basic'), { appId: 'a', appSecret: 's', code: 'c', redirectUri: 'r' }), /droit de publier/)
})

test('errors never leak the app secret or a token', async () => {
  const fail = (async () => json({ error_type: 'OAuthException', code: 400, error_message: 'Matching code was not found or was already used' }, 400)) as unknown as typeof fetch
  await assert.rejects(exchangeInstagramCode(fail, { appId: 'a', appSecret: 'SUPERSECRET', code: 'c', redirectUri: 'r' }), (e: Error) => !e.message.includes('SUPERSECRET') && /already used/.test(e.message))
  await assert.rejects(refreshInstagramToken((async () => { throw new Error('boom SECRETTOKEN') }) as unknown as typeof fetch, { token: 'SECRETTOKEN' }), (e: Error) => !e.message.includes('SECRETTOKEN'))
})

test('fetchInstagramProfile reads the account and isProfessionalAccount rejects a personal one', async () => {
  const profile = await fetchInstagramProfile((async () => json({ data: [{ user_id: '77', username: 'streamer', account_type: 'Media_Creator' }] })) as unknown as typeof fetch, 'tok')
  assert.deepEqual(profile, { userId: '77', username: 'streamer', accountType: 'MEDIA_CREATOR' })
  assert.ok(isProfessionalAccount('BUSINESS') && isProfessionalAccount('MEDIA_CREATOR') && isProfessionalAccount(null))
  assert.ok(!isProfessionalAccount('PERSONAL'))
})

test('instagramRefreshDue: expired, due before 50 days, fresh after a renewal', () => {
  const now = 1_000_000_000_000
  assert.equal(instagramRefreshDue(null, now), 'expired')
  assert.equal(instagramRefreshDue(new Date(now - 1), now), 'expired')
  assert.equal(instagramRefreshDue(new Date(now + 20 * day), now), 'due')
  assert.equal(instagramRefreshDue(new Date(now + 59 * day), now), 'fresh')
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

test('publisher: falls back to the clip caption and renews a token that is due, returning the new one', async () => {
  const meta = fakeMeta()
  const result = await publisher(meta.fetchFn).publish(input({ expiresAt: new Date(Date.now() + 20 * day) }) as any)
  assert.equal(new URLSearchParams(meta.calls.find(c => c.url.endsWith('/ig-1/media'))!.body).get('caption'), 'Ma légende #twitch')
  assert.equal(result.accessToken?.value, 'tok-new')
  assert.equal(result.accessToken?.refreshToken, 'tok-new')
  assert.equal(meta.calls.find(c => c.url.endsWith('/ig-1/media'))!.auth, 'Bearer tok-new')
})

test('publisher: a failed renewal does not block a token that is still valid; an expired one asks to reconnect', async () => {
  const meta = fakeMeta({ refreshFails: true })
  const ok = await publisher(meta.fetchFn).publish(input({ expiresAt: new Date(Date.now() + 20 * day) }) as any)
  assert.equal(ok.externalId, 'media-9')
  assert.equal(ok.accessToken, undefined)
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

test('runPublishOnce passes the clip and the Instagram account id to the publisher and stores the renewed token', async () => {
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
  assert.equal((saved[0] as { value: string }).value, 'tok-new')
  assert.ok(meta.calls.some(c => c.url.endsWith('/ig-1/media')))
})
