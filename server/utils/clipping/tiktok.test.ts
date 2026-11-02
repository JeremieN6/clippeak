import test from 'node:test'
import assert from 'node:assert/strict'
import { PublishError } from './publishing.ts'
import type { DuePublication, PublishStore } from './publishQueue.ts'
import { runPublishOnce } from './publishQueue.ts'
import { buildTiktokAuthUrl, checkPostOptions, classifyTiktokError, exchangeTiktokCode, queryCreatorInfo, refreshTiktokTokens } from './tiktokApi.ts'
import type { TiktokCreatorInfo } from './tiktokApi.ts'
import { createTiktokPublisher } from './tiktokPublisher.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const ok = (data: unknown) => json({ data, error: { code: 'ok', message: '' } })
const creatorData = { creator_nickname: 'Jérémie', creator_username: 'jeremfut7', creator_avatar_url: 'https://x/a.jpg', privacy_level_options: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE', 'BIDON'], comment_disabled: false, duet_disabled: true, stitch_disabled: false, max_video_post_duration_sec: 600 }

const options = { title: 'Mon clip #twitch', privacyLevel: 'SELF_ONLY', disableComment: true, disableDuet: true, disableStitch: true, brandOrganic: false, brandContent: false }
const input = (over: Record<string, unknown> = {}) => ({ title: 'T', caption: 'C', hashtags: '', videoPath: '/clip.mp4', options, refreshToken: 'rt-old', accessToken: 'at-valid', expiresAt: new Date(Date.now() + 3600_000), ...over })

// Faux TikTok : suit les appels dans l'ordre et enregistre ce qui est envoye.
function fakeTiktok(opts: { statuses?: Array<Record<string, unknown>>, initError?: { status: number, code: string }, uploadStatus?: number, creator?: unknown } = {}) {
  const calls: Array<{ url: string, method: string, body: any, headers: Record<string, string> }> = []
  let poll = 0
  const fetchFn = (async (url: string, init: any = {}) => {
    const body = typeof init.body === 'string' ? (init.headers?.['content-type']?.includes('json') ? JSON.parse(init.body) : init.body) : init.body
    calls.push({ url, method: init.method ?? 'GET', body, headers: init.headers ?? {} })
    if (url.endsWith('/v2/oauth/token/')) return json({ access_token: 'at-new', refresh_token: 'rt-new', expires_in: 86400, scope: 'user.info.basic,video.publish', open_id: 'oid' })
    if (url.endsWith('/creator_info/query/')) return ok(opts.creator ?? creatorData)
    if (url.endsWith('/video/init/')) return opts.initError ? json({ error: { code: opts.initError.code, message: 'refus' } }, opts.initError.status) : ok({ publish_id: 'v_pub_1', upload_url: 'https://upload.test/u' })
    if (url === 'https://upload.test/u') return new Response('', { status: opts.uploadStatus ?? 201 })
    if (url.endsWith('/status/fetch/')) {
      const list = opts.statuses ?? [{ status: 'PROCESSING_UPLOAD' }, { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['7300000000000000001'] }]
      return ok(list[Math.min(poll++, list.length - 1)])
    }
    return json({}, 404)
  }) as unknown as typeof fetch
  return { fetchFn, calls }
}
const publisher = (fetchFn: typeof fetch, extra: Record<string, unknown> = {}) => createTiktokPublisher({ clientKey: 'ck', clientSecret: 'cs', fetchFn, readVideo: async () => Buffer.alloc(1000), sleep: async () => {}, statusIntervalMs: 1, ...extra })

test('buildTiktokAuthUrl asks only for the two scopes Clippeak needs and carries the anti-forgery state', () => {
  const url = new URL(buildTiktokAuthUrl({ clientKey: 'ck', redirectUri: 'https://clippeak.sassify.fr/api/auth/tiktok/callback', state: 'abc' }))
  assert.equal(url.origin + url.pathname, 'https://www.tiktok.com/v2/auth/authorize/')
  assert.equal(url.searchParams.get('scope'), 'user.info.basic,video.publish')
  assert.equal(url.searchParams.get('state'), 'abc')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('client_key'), 'ck')
})

test('exchangeTiktokCode returns the tokens, refuses a missing publish right and never leaks the secret in errors', async () => {
  const good = fakeTiktok()
  const tokens = await exchangeTiktokCode(good.fetchFn, { clientKey: 'ck', clientSecret: 'cs', code: 'c', redirectUri: 'r', now: () => 0 })
  assert.equal(tokens.accessToken, 'at-new')
  assert.equal(tokens.refreshToken, 'rt-new')
  assert.equal(tokens.expiresAt.getTime(), 86400_000)
  assert.match(String(good.calls[0].body), /grant_type=authorization_code/)
  const noPublish = (async () => json({ access_token: 'a', refresh_token: 'r', scope: 'user.info.basic' })) as unknown as typeof fetch
  await assert.rejects(exchangeTiktokCode(noPublish, { clientKey: 'ck', clientSecret: 'topsecret', code: 'c', redirectUri: 'r' }), /droit de publier/)
  const refused = (async () => json({ error: 'invalid_grant', error_description: 'x' }, 400)) as unknown as typeof fetch
  await assert.rejects(exchangeTiktokCode(refused, { clientKey: 'ck', clientSecret: 'topsecret', code: 'c', redirectUri: 'r' }), (e: Error) => /invalid_grant/.test(e.message) && !/topsecret/.test(e.message))
})

test('refreshTiktokTokens sends the refresh grant and returns the rotated refresh token', async () => {
  const fake = fakeTiktok()
  const tokens = await refreshTiktokTokens(fake.fetchFn, { clientKey: 'ck', clientSecret: 'cs', refreshToken: 'rt-old' })
  assert.equal(tokens.refreshToken, 'rt-new')
  assert.match(String(fake.calls[0].body), /grant_type=refresh_token/)
  assert.match(String(fake.calls[0].body), /refresh_token=rt-old/)
})

test('queryCreatorInfo keeps only known privacy levels', async () => {
  const info = await queryCreatorInfo(fakeTiktok().fetchFn, 'at')
  assert.deepEqual(info.privacyOptions, ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'])
  assert.equal(info.nickname, 'Jérémie')
  assert.equal(info.duetDisabled, true)
})

test('classifyTiktokError separates reconnect, daily limits, refusals and retryable errors', () => {
  assert.equal(classifyTiktokError(401, 'access_token_invalid', '').kind, 'auth')
  assert.equal(classifyTiktokError(401, 'scope_not_authorized', '').kind, 'auth')
  assert.equal(classifyTiktokError(403, 'spam_risk_too_many_posts', '').kind, 'quota')
  assert.equal(classifyTiktokError(403, 'reached_active_user_cap', '').kind, 'quota')
  assert.equal(classifyTiktokError(403, 'unaudited_client_can_only_post_to_private_accounts', '').kind, 'rejected')
  assert.equal(classifyTiktokError(429, 'rate_limit_exceeded', '').kind, 'transient')
  assert.equal(classifyTiktokError(503, '', '').kind, 'transient')
  assert.equal(classifyTiktokError(400, 'invalid_param', 'bad').kind, 'rejected')
})

test('checkPostOptions enforces TikTok rules against the account settings', () => {
  const creator: TiktokCreatorInfo = { nickname: 'n', username: 'u', avatarUrl: null, privacyOptions: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'], commentDisabled: false, duetDisabled: true, stitchDisabled: false, maxVideoDurationSec: 60 }
  const base = { ...options, privacyLevel: 'PUBLIC_TO_EVERYONE' as const }
  assert.equal(checkPostOptions(base, creator, 30), null)
  assert.match(checkPostOptions({ ...base, title: ' ' }, creator, null) ?? '', /titre/)
  assert.match(checkPostOptions({ ...base, privacyLevel: 'FOLLOWER_OF_CREATOR' }, creator, null) ?? '', /visibilité/)
  assert.match(checkPostOptions({ ...base, disableDuet: false }, creator, null) ?? '', /duos/)
  assert.match(checkPostOptions({ ...base, privacyLevel: 'SELF_ONLY', brandContent: true }, creator, null) ?? '', /marque/)
  assert.match(checkPostOptions(base, creator, 90) ?? '', /durée/)
})

test('publisher: checks the account, opens the upload, sends the file in one chunk and returns the post link', async () => {
  const fake = fakeTiktok()
  const result = await publisher(fake.fetchFn).publish(input() as any)
  assert.equal(result.externalId, 'v_pub_1')
  assert.equal(result.url, 'https://www.tiktok.com/@jeremfut7/video/7300000000000000001')
  assert.equal(result.accessToken, undefined, 'valid access token: nothing renewed')
  const urls = fake.calls.map(c => c.url.replace('https://open.tiktokapis.com', ''))
  assert.deepEqual(urls.slice(0, 3), ['/v2/post/publish/creator_info/query/', '/v2/post/publish/video/init/', 'https://upload.test/u'])
  const init = fake.calls[1].body
  assert.deepEqual(init.source_info, { source: 'FILE_UPLOAD', video_size: 1000, chunk_size: 1000, total_chunk_count: 1 })
  assert.equal(init.post_info.privacy_level, 'SELF_ONLY')
  assert.equal(init.post_info.disable_duet, true)
  assert.equal(init.post_info.title, 'Mon clip #twitch')
  assert.equal(fake.calls[2].headers['content-range'], 'bytes 0-999/1000')
  assert.equal(fake.calls[0].headers.authorization, 'Bearer at-valid')
})

test('publisher: renews an expired access token and hands back BOTH new tokens', async () => {
  const fake = fakeTiktok()
  const result = await publisher(fake.fetchFn).publish(input({ expiresAt: new Date(Date.now() - 1000) }) as any)
  assert.equal(result.accessToken?.value, 'at-new')
  assert.equal(result.accessToken?.refreshToken, 'rt-new')
  assert.equal(fake.calls[1].headers.authorization, 'Bearer at-new')
})

test('publisher: a refused publication keeps the renewed tokens on the error so they are not lost', async () => {
  const fake = fakeTiktok({ initError: { status: 400, code: 'invalid_param' } })
  await assert.rejects(publisher(fake.fetchFn).publish(input({ accessToken: null, expiresAt: null }) as any), (e: PublishError) => e.kind === 'rejected' && e.renewed?.refreshToken === 'rt-new')
})

test('publisher: refuses without a chosen privacy level, a privacy level the account no longer allows, and unaudited public posting', async () => {
  const fake = fakeTiktok()
  await assert.rejects(publisher(fake.fetchFn).publish(input({ options: { ...options, privacyLevel: undefined } }) as any), /visibilité n’a pas été choisie/)
  await assert.rejects(publisher(fake.fetchFn).publish(input({ options: { ...options, privacyLevel: 'FOLLOWER_OF_CREATOR' } }) as any), /n’est plus permise/)
  const unaudited = fakeTiktok({ initError: { status: 403, code: 'unaudited_client_can_only_post_to_private_accounts' } })
  await assert.rejects(publisher(unaudited.fetchFn).publish(input() as any), (e: PublishError) => e.kind === 'rejected' && /pas encore validé/.test(e.message))
  assert.equal(fake.calls.filter(c => c.url.endsWith('/video/init/')).length, 0, 'nothing was sent to TikTok')
})

test('publisher: a failed processing is reported, and a missing confirmation is NOT retried (the video may be online)', async () => {
  const failed = fakeTiktok({ statuses: [{ status: 'FAILED', fail_reason: 'file_format_check_failed' }] })
  await assert.rejects(publisher(failed.fetchFn).publish(input() as any), /file_format_check_failed/)
  let clock = 0
  const stuck = fakeTiktok({ statuses: [{ status: 'PROCESSING_UPLOAD' }] })
  await assert.rejects(publisher(stuck.fetchFn, { now: () => (clock += 100_000), statusTimeoutMs: 250_000 }).publish(input() as any), (e: PublishError) => e.kind === 'rejected' && /vérifie sur ton compte/.test(e.message))
})

test('publisher: refuses a clip over 64 MB and an unreadable file before opening any upload', async () => {
  const fake = fakeTiktok()
  await assert.rejects(publisher(fake.fetchFn, { readVideo: async () => ({ length: 65 * 1024 * 1024 }) as Buffer }).publish(input() as any), /trop lourd/)
  await assert.rejects(publisher(fake.fetchFn, { readVideo: async () => { throw new Error('ENOENT') } }).publish(input() as any), /introuvable/)
  assert.equal(fake.calls.filter(c => c.url.endsWith('/video/init/')).length, 0)
})

test('queue: renewed TikTok tokens are saved even when the publication fails, and the options reach the publisher', async () => {
  const saved: unknown[] = []
  const due: DuePublication = {
    id: 'p1', platform: 'tiktok', attempts: 0, options,
    clip: { id: 'c1', title: 'T', caption: 'C', hashtags: '', videoPath: '/clip.mp4', status: 'approved' },
    connection: { id: 'conn1', refreshToken: 'rt-old', accessToken: null, expiresAt: null }
  }
  let failure = ''
  let seenOptions: unknown = null
  const store: PublishStore = {
    requeueInterrupted: async () => 0,
    claimDue: async () => due,
    saveAccessToken: async (_id, token) => { saved.push(token) },
    markPublished: async () => {},
    markFailed: async (_id, error) => { failure = error }
  }
  const fake = fakeTiktok({ initError: { status: 400, code: 'invalid_param' } })
  const real = publisher(fake.fetchFn)
  const spy = { platform: 'tiktok' as const, publish: async (i: any) => { seenOptions = i.options; return real.publish(i) } }
  await runPublishOnce({ store, publishers: { tiktok: spy } })
  assert.deepEqual(seenOptions, options)
  assert.equal(saved.length, 1)
  assert.equal((saved[0] as any).refreshToken, 'rt-new')
  assert.ok(failure)
})
