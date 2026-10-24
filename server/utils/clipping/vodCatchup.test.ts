import test from 'node:test'
import assert from 'node:assert/strict'
import { runVodCatchup } from './vodCatchup.ts'
import { createTwitchApi, parseTwitchDuration } from './twitchApi.ts'

const CHANNEL = { id: 'c1', twitchId: '42', createdAt: new Date('2026-10-23T10:00:00Z') }
const NOW = new Date('2026-10-23T20:00:00Z')

const video = (id: string, streamId: string | null, createdAt: string, durationSec = 600) =>
  ({ id, streamId, url: `https://twitch.tv/videos/${id}`, title: 'T', createdAt: new Date(createdAt), durationSec })

function fakeStore(options: { known?: string[], live?: string[], channels?: typeof CHANNEL[] } = {}) {
  const upserts: any[] = []
  const ended: Array<[string, Date]> = []
  const store = {
    listAutoClipChannels: async () => options.channels ?? [CHANNEL],
    findKnownVodIds: async (ids: string[]) => new Set(ids.filter(id => (options.known ?? []).includes(id))),
    listLiveVodIds: async () => options.live ?? [],
    upsertVod: async (v: any) => { upserts.push(v) },
    markVodEnded: async (id: string, at: Date) => { ended.push([id, at]) }
  }
  return { store, upserts, ended }
}

const fakeApi = (archives: any[], live: Array<[string, { id: string, userId: string, startedAt: Date }]> = []) => ({
  listArchives: async () => archives,
  getLiveStreams: async () => new Map(live)
})

test('catch-up registers a finished VOD whose notifications were lost, with its computed end', async () => {
  const { store, upserts } = fakeStore()
  const api = fakeApi([video('v1', 's1', '2026-10-23T18:00:00Z', 3600)])
  const summary = await runVodCatchup({ api, store, now: () => NOW })
  assert.deepEqual(summary, { channels: 1, registered: 1, closed: 0, errors: 0 })
  assert.equal(upserts[0].status, 'ended')
  assert.equal(upserts[0].endedAt.toISOString(), '2026-10-23T19:00:00.000Z')
})

test('catch-up registers the VOD of the stream currently live as "live"', async () => {
  const { store, upserts } = fakeStore()
  const startedAt = new Date('2026-10-23T19:55:00Z')
  const api = fakeApi([video('v2', 's2', '2026-10-23T19:55:07Z', 300)], [['42', { id: 's2', userId: '42', startedAt }]])
  await runVodCatchup({ api, store, now: () => NOW })
  assert.equal(upserts[0].status, 'live')
  assert.equal(upserts[0].endedAt, null)
  assert.equal(upserts[0].startedAt, startedAt)
})

test('catch-up skips known VODs and VODs older than the channel registration', async () => {
  const { store, upserts } = fakeStore({ known: ['v1'] })
  const api = fakeApi([
    video('v1', 's1', '2026-10-23T18:00:00Z'),
    video('old', 's0', '2026-10-01T18:00:00Z')
  ])
  const summary = await runVodCatchup({ api, store, now: () => NOW })
  assert.equal(summary.registered, 0)
  assert.equal(upserts.length, 0)
})

test('catch-up closes a "live" VOD when the stream is over, using the archive end time', async () => {
  const { store, ended } = fakeStore({ known: ['v1'], live: ['v1'] })
  const api = fakeApi([video('v1', 's1', '2026-10-23T18:00:00Z', 1800)])
  const summary = await runVodCatchup({ api, store, now: () => NOW })
  assert.equal(summary.closed, 1)
  assert.deepEqual(ended, [['v1', new Date('2026-10-23T18:30:00Z')]])
})

test('catch-up leaves alone the "live" VOD of the stream that is still running', async () => {
  const { store, ended } = fakeStore({ known: ['v2'], live: ['v2'] })
  const api = fakeApi([video('v2', 's2', '2026-10-23T19:55:00Z')], [['42', { id: 's2', userId: '42', startedAt: NOW }]])
  const summary = await runVodCatchup({ api, store, now: () => NOW })
  assert.equal(summary.closed, 0)
  assert.equal(ended.length, 0)
})

test('catch-up closes an orphan "live" VOD missing from Helix with the current time', async () => {
  const { store, ended } = fakeStore({ live: ['gone'] })
  await runVodCatchup({ api: fakeApi([]), store, now: () => NOW })
  assert.deepEqual(ended, [['gone', NOW]])
})

test('catch-up does nothing without channels and survives one failing channel', async () => {
  const empty = fakeStore({ channels: [] })
  let called = false
  const api = { listArchives: async () => { called = true; return [] }, getLiveStreams: async () => { called = true; return new Map() } }
  assert.deepEqual(await runVodCatchup({ api, store: empty.store }), { channels: 0, registered: 0, closed: 0, errors: 0 })
  assert.equal(called, false)

  const two = fakeStore({ channels: [CHANNEL, { ...CHANNEL, id: 'c2', twitchId: '43' }] })
  let n = 0
  const flaky = {
    listArchives: async () => { if (n++ === 0) throw new Error('429'); return [video('v9', 's9', '2026-10-23T18:00:00Z')] },
    getLiveStreams: async () => new Map()
  }
  const originalError = console.error
  console.error = () => {}
  const summary = await runVodCatchup({ api: flaky, store: two.store, now: () => NOW })
  console.error = originalError
  assert.deepEqual(summary, { channels: 2, registered: 1, closed: 0, errors: 1 })
})

test('parseTwitchDuration reads Helix durations', () => {
  assert.equal(parseTwitchDuration('4m24s'), 264)
  assert.equal(parseTwitchDuration('1h2m3s'), 3723)
  assert.equal(parseTwitchDuration('30s'), 30)
  assert.equal(parseTwitchDuration('3h'), 10800)
  assert.equal(parseTwitchDuration(undefined), 0)
  assert.equal(parseTwitchDuration('n/a'), 0)
})

test('getLiveStreams batches user ids by 100 and maps live streams by user', async () => {
  const urls: string[] = []
  const fetchFn = (async (url: string) => {
    if (url.includes('oauth2/token')) return { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 3600 }) }
    urls.push(url)
    const data = url.includes('user_id=u0&') ? [{ id: 's1', user_id: 'u0', started_at: '2026-10-23T19:00:00Z', type: 'live' }] : []
    return { ok: true, status: 200, json: async () => ({ data }) }
  }) as unknown as typeof fetch
  const api = createTwitchApi({ clientId: 'a', clientSecret: 'b' }, fetchFn)
  const ids = Array.from({ length: 150 }, (_, i) => `u${i}`)
  const live = await api.getLiveStreams(ids)
  assert.equal(urls.length, 2)
  assert.equal(live.get('u0')?.id, 's1')
  assert.equal(live.size, 1)
})
