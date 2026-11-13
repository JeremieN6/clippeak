import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
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

test('clampLongMax keeps the maximum between 30 s and 15 min', () => {
  assert.equal(clampLongMax(600), 600)
  assert.equal(clampLongMax(5), 30)
  assert.equal(clampLongMax(7200), 900)
  assert.equal(clampLongMax(Number.NaN), 600)
})

test('validateLongRange explains what is wrong in plain French', () => {
  const ok = { startSec: 100, endSec: 400, maxSec: 600 }
  assert.equal(validateLongRange(ok), null)
  assert.match(validateLongRange({ ...ok, endSec: 100 })!, /après le début/)
  assert.match(validateLongRange({ ...ok, endSec: 110 })!, /au moins 30/)
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
