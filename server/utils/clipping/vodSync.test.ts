import test from 'node:test'
import assert from 'node:assert/strict'
import { computeSignature, createSeenMessages, verifyEventSubSignature } from './eventsub.ts'
import { createTwitchApi, TwitchApiError } from './twitchApi.ts'
import { handleStreamOffline, handleStreamOnline, syncRecentVods } from './vodSync.ts'
import type { VodRecord, VodStore } from './vodSync.ts'

const NOW = Date.parse('2026-10-23T20:00:00Z')

test('signature: valid message passes, tampering and replays fail', () => {
  const secret = 'a-secret-of-sufficient-length'
  const id = 'msg-1'
  const timestamp = '2026-10-23T19:59:30Z'
  const rawBody = '{"hello":"world"}'
  const signature = computeSignature(secret, id, timestamp, rawBody)
  const base = { secret, id, timestamp, signature, rawBody, now: NOW }

  assert.equal(verifyEventSubSignature(base), true)
  assert.equal(verifyEventSubSignature({ ...base, rawBody: '{"hello":"mars"}' }), false)
  assert.equal(verifyEventSubSignature({ ...base, secret: 'another-secret-value' }), false)
  assert.equal(verifyEventSubSignature({ ...base, signature: 'sha256=abc' }), false)
  assert.equal(verifyEventSubSignature({ ...base, signature: undefined }), false)
  assert.equal(verifyEventSubSignature({ ...base, secret: '' }), false)
  assert.equal(verifyEventSubSignature({ ...base, now: NOW + 11 * 60_000 }), false)
  assert.equal(verifyEventSubSignature({ ...base, timestamp: 'not-a-date' }), false)
})

test('seen messages: duplicate ids are detected and capacity is bounded', () => {
  const seen = createSeenMessages(2)
  assert.equal(seen.check('a'), false)
  assert.equal(seen.check('a'), true)
  seen.check('b')
  seen.check('c')
  assert.equal(seen.check('a'), false)
})

function fakeTwitch(handlers: Array<(url: string, init: any) => { status?: number, body?: unknown }>) {
  const calls: Array<{ url: string, init: any }> = []
  let i = 0
  const fn = async (url: any, init: any) => {
    calls.push({ url: String(url), init })
    const { status = 200, body = {} } = handlers[Math.min(i++, handlers.length - 1)](String(url), init)
    return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response
  }
  return { fn: fn as unknown as typeof fetch, calls }
}

const token = () => ({ body: { access_token: 'tok', expires_in: 3600 } })
const creds = { clientId: 'cid', clientSecret: 'csecret' }

test('api: token is cached across calls and refreshed after a 401', async () => {
  const { fn, calls } = fakeTwitch([
    token,
    () => ({ body: { data: [{ id: '1', login: 'abc', display_name: 'Abc' }] } }),
    () => ({ body: { data: [] } }),
    () => ({ status: 401 }),
    token,
    () => ({ body: { data: [] } })
  ])
  const api = createTwitchApi(creds, fn, () => NOW)
  assert.deepEqual(await api.getUserByLogin('abc'), { id: '1', login: 'abc', displayName: 'Abc' })
  assert.equal(await api.getUserByLogin('nobody'), null)
  assert.equal(calls.filter(c => c.url.includes('oauth2/token')).length, 1)

  assert.equal(await api.getUserByLogin('x'), null)
  assert.equal(calls.filter(c => c.url.includes('oauth2/token')).length, 2)
  assert.equal(calls[1].init.headers['Client-Id'], 'cid')
  assert.equal(calls[1].init.headers.Authorization, 'Bearer tok')
})

test('api: archives are mapped; subscribe treats 409 as existing and surfaces errors', async () => {
  const { fn, calls } = fakeTwitch([
    token,
    () => ({ body: { data: [{ id: 'v1', stream_id: 's1', url: 'https://twitch.tv/videos/v1', title: 'Live', created_at: '2026-10-23T19:00:00Z' }] } }),
    () => ({ status: 202 }),
    () => ({ status: 409 }),
    () => ({ status: 400, body: { message: 'bad' } })
  ])
  const api = createTwitchApi(creds, fn, () => NOW)
  const [video] = await api.listArchives('1')
  assert.equal(video.streamId, 's1')
  assert.equal(video.createdAt.toISOString(), '2026-10-23T19:00:00.000Z')

  assert.equal(await api.subscribe('stream.online', '1', 'https://x.test/cb', 'secretsecret'), 'created')
  assert.equal(await api.subscribe('stream.offline', '1', 'https://x.test/cb', 'secretsecret'), 'exists')
  const sent = JSON.parse(calls[2].init.body)
  assert.deepEqual(sent.condition, { broadcaster_user_id: '1' })
  assert.equal(sent.transport.method, 'webhook')
  await assert.rejects(api.subscribe('stream.online', '1', 'https://x.test/cb', 's'), (e: any) => e instanceof TwitchApiError && e.status === 400)
})

function memoryStore(autoClip = true) {
  const vods: VodRecord[] = []
  let ended = 0
  const store: VodStore = {
    findChannelByTwitchId: async id => id === '42' ? { id: 'chan-1', twitchId: '42', autoClip } : null,
    upsertVod: async v => { vods.push(v) },
    markLiveVodsEnded: async () => { ended++; return 1 }
  }
  return { store, vods, ended: () => ended }
}

const video = (id: string, streamId: string | null) => ({ id, streamId, url: `https://twitch.tv/videos/${id}`, title: 'T', createdAt: new Date('2026-10-23T19:00:00Z') })

test('online: registers the VOD matching the stream id', async () => {
  const { store, vods } = memoryStore()
  const api = { listArchives: async () => [video('old', 's0'), video('new', 's1')] }
  const outcome = await handleStreamOnline({ id: 's1', broadcaster_user_id: '42', started_at: '2026-10-23T19:00:05Z' }, { api, store })
  assert.equal(outcome, 'vod_registered')
  assert.equal(vods[0].twitchVodId, 'new')
  assert.equal(vods[0].status, 'live')
  assert.equal(vods[0].source, 'auto')
})

test('online: retries until the VOD appears, then gives up as pending', async () => {
  const { store, vods } = memoryStore()
  let calls = 0
  const sleeps: number[] = []
  const late = { listArchives: async () => (++calls < 3 ? [] : [video('v', 's1')]) }
  const deps = { store, sleep: async (ms: number) => { sleeps.push(ms) }, retryDelayMs: 5 }
  assert.equal(await handleStreamOnline({ id: 's1', broadcaster_user_id: '42' }, { ...deps, api: late }), 'vod_registered')
  assert.deepEqual(sleeps, [5, 5])
  assert.equal(vods.length, 1)

  const never = { listArchives: async () => [] }
  assert.equal(await handleStreamOnline({ id: 's9', broadcaster_user_id: '42' }, { ...deps, api: never, retries: 2 }), 'vod_pending')
})

test('online/offline: unknown channels and autoClip=false are ignored', async () => {
  const api = { listArchives: async () => { throw new Error('must not be called') } }
  assert.equal(await handleStreamOnline({ id: 's', broadcaster_user_id: '999' }, { api, store: memoryStore().store }), 'ignored')
  assert.equal(await handleStreamOnline({ id: 's', broadcaster_user_id: '42' }, { api, store: memoryStore(false).store }), 'ignored')
  assert.equal(await handleStreamOffline({ broadcaster_user_id: '42' }, { api, store: memoryStore(false).store }), 'ignored')
})

test('offline: reconciles the latest VOD then marks live VODs as ended', async () => {
  const { store, vods, ended } = memoryStore()
  const api = { listArchives: async () => [video('latest', 's1'), video('older', 's0')] }
  const outcome = await handleStreamOffline({ broadcaster_user_id: '42' }, { api, store, now: () => new Date(NOW) })
  assert.equal(outcome, 'ended')
  assert.deepEqual(vods.map(v => v.twitchVodId), ['latest'])
  assert.equal(ended(), 1)
})

test('syncRecentVods respects the limit', async () => {
  const { store, vods } = memoryStore()
  const api = { listArchives: async () => [video('a', null), video('b', null), video('c', null)] }
  assert.equal(await syncRecentVods({ id: 'chan-1', twitchId: '42', autoClip: true }, { api, store }, 2), 2)
  assert.equal(vods.length, 2)
})
