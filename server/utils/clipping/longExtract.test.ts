import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildLongRenderArgs, clampLongMax, evaluateLongQc, formatClock, longYoutubeMetadata, parseClock, validateLongRange } from './longExtract.ts'
import { LongQcFailedError, renderLongJob } from './longRender.ts'
import { createYoutubePublisher } from './youtubePublisher.ts'
import { runPublishOnce } from './publishQueue.ts'
import type { DuePublication, PublishStore } from './publishQueue.ts'

test('parseClock and formatClock read and write hours, minutes and seconds', () => {
  assert.equal(parseClock('1:23:45'), 5025)
  assert.equal(parseClock('23:45'), 1425)
  assert.equal(parseClock(' 90 '), 90)
  assert.equal(parseClock('1:75'), null)
  assert.equal(parseClock('abc'), null)
  assert.equal(parseClock(''), null)
  assert.equal(parseClock('1:2:3:4'), null)
  assert.equal(formatClock(5025), '1:23:45')
  assert.equal(formatClock(600), '10:00')
  assert.equal(formatClock(-5), '0:00')
})

test('clampLongMax keeps the maximum between 3 min and 15 min, or 60 min for a verified channel', () => {
  assert.equal(clampLongMax(600), 600)
  assert.equal(clampLongMax(5), 180)
  assert.equal(clampLongMax(7200), 900)
  assert.equal(clampLongMax(3000), 900)
  assert.equal(clampLongMax(3000, true), 3000)
  assert.equal(clampLongMax(7200, true), 3600)
  assert.equal(clampLongMax(Number.NaN), 600)
})

test('validateLongRange explains what is wrong in plain French', () => {
  const ok = { startSec: 100, endSec: 400, maxSec: 600 }
  assert.equal(validateLongRange(ok), null)
  assert.match(validateLongRange({ ...ok, endSec: 100 })!, /après le début/)
  assert.match(validateLongRange({ ...ok, endSec: 250 })!, /au moins 3 minutes/)
  assert.equal(validateLongRange({ ...ok, endSec: 280 }), null)
  assert.equal(validateLongRange({ ...ok, endSec: 3000, maxSec: 3600 }), null)
  assert.match(validateLongRange({ ...ok, endSec: 1000 })!, /au plus 10:00/)
  assert.match(validateLongRange({ ...ok, startSec: -1 })!, /valides/)
  assert.match(validateLongRange({ ...ok, vodDurationSec: 200 })!, /dépasse la fin du live/)
  // Une minute de marge : la duree d'une VOD n'est connue qu'approximativement.
  assert.equal(validateLongRange({ ...ok, vodDurationSec: 380 }), null)
  assert.equal(validateLongRange({ ...ok, vodDurationSec: null }), null)
})

test('buildLongRenderArgs cuts the chosen passage into 1280x720 with the original sound', () => {
  const args = buildLongRenderArgs({ input: 'https://example.test/vod.m3u8', startSec: 100, durationSec: 300, outPath: 'out.mp4', threads: 2 })
  assert.deepEqual(args.slice(args.indexOf('-ss'), args.indexOf('-ss') + 6), ['-ss', '100.00', '-i', 'https://example.test/vod.m3u8', '-t', '300.00'])
  assert.ok(args.join(' ').includes('scale=1280:720'))
  assert.ok(args.includes('-movflags'))
  assert.equal(args.at(-1), 'out.mp4')
  assert.ok(!args.includes('-filter_complex'))
})

test('evaluateLongQc checks format, duration and sound', () => {
  const good = { width: 1280, height: 720, videoSec: 300.4, audioSec: 300.3 }
  assert.equal(evaluateLongQc(good, 300).passed, true)
  assert.equal(evaluateLongQc({ ...good, width: 1080, height: 1920 }, 300).issues[0].code, 'resolution')
  assert.equal(evaluateLongQc({ ...good, videoSec: 120 }, 300).issues[0].code, 'duration')
  assert.equal(evaluateLongQc({ ...good, audioSec: null }, 300).issues[0].code, 'no_audio')
  assert.equal(evaluateLongQc({ ...good, audioSec: 290 }, 300).issues[0].code, 'sync')
})

test('longYoutubeMetadata never adds #Shorts and caps the title', () => {
  const meta = longYoutubeMetadata('B'.repeat(200), 'Légende <i>x</i>', '#twitch #Shorts #fail')
  assert.ok(meta.title.length <= 100)
  assert.ok(!meta.title.includes('Shorts'))
  assert.equal(meta.description, 'Légende ix/i\n\n#twitch #fail')
  assert.equal(longYoutubeMetadata('', '', '').title, 'Extrait de live')
})

test('renderLongJob cuts, probes and refuses a result that fails the quality check', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'long-test-'))
  try {
    const calls: string[][] = []
    const deps = {
      getVideoUrl: async () => 'https://example.test/vod.m3u8',
      runFfmpeg: async (args: string[]) => { calls.push(args); return '' },
      probe: () => ({ width: 1280, height: 720, videoSec: 300, audioSec: 300 }),
      outputDir: dir
    }
    const job = { jobId: 'job-1', vodTwitchId: '123', startSec: 100, endSec: 400, maxSec: 600 }
    const done = await renderLongJob(job, deps)
    assert.equal(done.outputPath, join(dir, 'job-1.mp4'))
    assert.equal(calls.length, 1)
    assert.ok(calls[0].includes('300.00'))

    await assert.rejects(renderLongJob({ ...job, startSec: null }, deps), /début et de fin/)
    await assert.rejects(renderLongJob({ ...job, endSec: 2000 }, deps), /au plus/)
    await assert.rejects(renderLongJob(job, { ...deps, probe: () => ({ width: 1080, height: 1920, videoSec: 300, audioSec: 300 }) }), LongQcFailedError)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

function fakeGoogle() {
  const calls: Array<{ url: string, body: string }> = []
  const fetchFn = (async (url: any, init: any = {}) => {
    calls.push({ url: String(url), body: String(init.body ?? '') })
    if (String(url).includes('token')) return new Response(JSON.stringify({ access_token: 'acc', expires_in: 3600 }), { status: 200 })
    if (String(url).includes('uploadType=resumable')) return new Response('{}', { status: 200, headers: { location: 'https://upload.test/session' } })
    return new Response(JSON.stringify({ id: 'LONG1' }), { status: 200 })
  }) as unknown as typeof fetch
  return { fetchFn, calls }
}

test('youtube publisher sends a long extract as a normal video, without #Shorts, and returns a watch link', async () => {
  const { fetchFn, calls } = fakeGoogle()
  const publisher = createYoutubePublisher({ clientId: 'id', clientSecret: 's', fetchFn, readVideo: async () => Buffer.from('x'), now: () => 0 })
  const result = await publisher.publish({ title: 'Le passage drôle', caption: 'Un extrait', hashtags: '#twitch', videoPath: 'v.mp4', options: null, format: 'long', refreshToken: 'r', accessToken: null, expiresAt: null })
  assert.equal(result.url, 'https://www.youtube.com/watch?v=LONG1')
  const snippet = JSON.parse(calls[1].body).snippet
  assert.equal(snippet.title, 'Le passage drôle')
  assert.ok(!snippet.description.includes('Shorts'))
})

test('the publish queue hands the format of the clip to the publisher', async () => {
  const seen: Array<string | undefined> = []
  const due: DuePublication = {
    id: 'p1', platform: 'youtube', attempts: 0, options: null,
    clip: { id: 'c1', title: 't', caption: '', hashtags: '', videoPath: 'v.mp4', status: 'approved', format: 'long' },
    connection: { id: 'k1', refreshToken: 'r', accessToken: null, expiresAt: null }
  }
  let served = false
  const store: PublishStore = {
    requeueInterrupted: async () => 0,
    claimDue: async () => (served ? null : (served = true, due)),
    saveAccessToken: async () => {},
    markPublished: async () => {},
    markFailed: async () => {}
  }
  await runPublishOnce({ store, publishers: { youtube: { platform: 'youtube', publish: async (input) => { seen.push(input.format); return { externalId: 'e', url: 'u' } } } } })
  assert.deepEqual(seen, ['long'])
})

// --- envoi YouTube par morceaux ---------------------------------------------------------------------------------------------------

function chunkedGoogle(script: { onChunk?: (n: number, range: string) => Response | null, onStatus?: () => Response | null } = {}) {
  const puts: Array<{ range: string, length: number }> = []
  let chunkNo = 0
  const fetchFn = (async (url: any, init: any = {}) => {
    const u = String(url)
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]))
    if (u.includes('token')) return Response.json({ access_token: 'acc', expires_in: 3600 })
    if (u.includes('uploadType=resumable')) return new Response('{}', { status: 200, headers: { location: 'https://upload.test/s' } })
    const range = headers['content-range']
    if (range.startsWith('bytes */')) return script.onStatus?.() ?? new Response(null, { status: 308 })
    puts.push({ range, length: Number(headers['content-length']) })
    chunkNo++
    const [, from, to, total] = /bytes (\d+)-(\d+)\/(\d+)/.exec(range)!.map(Number) as unknown as number[]
    const custom = script.onChunk?.(chunkNo, range)
    if (custom) return custom
    return Number(to) + 1 >= Number(total) ? Response.json({ id: 'BIG1' }) : new Response(null, { status: 308, headers: { range: `bytes=0-${to}` } })
  }) as unknown as typeof fetch
  return { fetchFn, puts }
}
const longInput = { title: 't', caption: '', hashtags: '', videoPath: 'v.mp4', options: null, format: 'long' as const, refreshToken: 'r', accessToken: null, expiresAt: null }
const bigVideo = Buffer.alloc(25, 7)

test('youtube publisher sends a big video in chunks, each with its byte range', async () => {
  const { fetchFn, puts } = chunkedGoogle()
  const result = await createYoutubePublisher({ clientId: 'i', clientSecret: 's', fetchFn, readVideo: async () => bigVideo, chunkBytes: 10, now: () => 0 }).publish(longInput)
  assert.equal(result.externalId, 'BIG1')
  assert.deepEqual(puts.map(p => p.range), ['bytes 0-9/25', 'bytes 10-19/25', 'bytes 20-24/25'])
  assert.deepEqual(puts.map(p => p.length), [10, 10, 5])
})

test('youtube publisher resumes after a failed chunk by asking YouTube what it already has', async () => {
  const { fetchFn, puts } = chunkedGoogle({
    onChunk: n => n === 2 ? new Response('boom', { status: 503 }) : null,
    onStatus: () => new Response(null, { status: 308, headers: { range: 'bytes=0-9' } })
  })
  const result = await createYoutubePublisher({ clientId: 'i', clientSecret: 's', fetchFn, readVideo: async () => bigVideo, chunkBytes: 10, now: () => 0 }).publish(longInput)
  assert.equal(result.externalId, 'BIG1')
  assert.deepEqual(puts.map(p => p.range), ['bytes 0-9/25', 'bytes 10-19/25', 'bytes 10-19/25', 'bytes 20-24/25'])
})

test('youtube publisher gives up as transient after three failures of the same chunk, and rejects a definite refusal at once', async () => {
  const down = chunkedGoogle({ onChunk: () => new Response('boom', { status: 503 }) })
  const failed = await createYoutubePublisher({ clientId: 'i', clientSecret: 's', fetchFn: down.fetchFn, readVideo: async () => bigVideo, chunkBytes: 10, now: () => 0 }).publish(longInput).catch(e => e)
  assert.equal(failed.kind, 'transient')
  assert.equal(down.puts.length, 3)
  const refused = chunkedGoogle({ onChunk: () => Response.json({ error: { message: 'Vidéo trop longue' } }, { status: 400 }) })
  const rejected = await createYoutubePublisher({ clientId: 'i', clientSecret: 's', fetchFn: refused.fetchFn, readVideo: async () => bigVideo, chunkBytes: 10, now: () => 0 }).publish(longInput).catch(e => e)
  assert.equal(rejected.kind, 'rejected')
  assert.match(rejected.message, /trop longue/)
  assert.equal(refused.puts.length, 1)
})

test('youtube publisher reads the video from disk chunk by chunk when no reader is injected, and refuses an empty or missing file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yt-test-'))
  try {
    const file = join(dir, 'v.mp4')
    await writeFile(file, bigVideo)
    const { fetchFn, puts } = chunkedGoogle()
    const publisher = createYoutubePublisher({ clientId: 'i', clientSecret: 's', fetchFn, chunkBytes: 10, now: () => 0 })
    assert.equal((await publisher.publish({ ...longInput, videoPath: file })).externalId, 'BIG1')
    assert.equal(puts.length, 3)
    const empty = join(dir, 'empty.mp4')
    await writeFile(empty, Buffer.alloc(0))
    assert.equal((await publisher.publish({ ...longInput, videoPath: empty }).catch(e => e)).kind, 'rejected')
    assert.equal((await publisher.publish({ ...longInput, videoPath: join(dir, 'absent.mp4') }).catch(e => e)).kind, 'rejected')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
