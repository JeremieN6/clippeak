import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, utimesSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { coversPlan, extractSources, purgeOldSources, sourceExtractArgs, sourceRelPath, sourceWindow } from './sourceExtract.ts'
import { checkVodReadable } from './vodAccess.ts'

test('sourceWindow keeps 60 s each side of the peak and never starts before 0', () => {
  assert.deepEqual(sourceWindow(600), { startSec: 540, durationSec: 120 })
  assert.deepEqual(sourceWindow(20), { startSec: 0, durationSec: 80 })
  assert.equal(sourceRelPath('v1', 'm1'), 'sources/v1/m1.mp4')
})

test('coversPlan: a plan inside the window is covered, a plan outside is not', () => {
  assert.equal(coversPlan(600, { startSec: 560, endSec: 610 }), true)
  assert.equal(coversPlan(600, { startSec: 530, endSec: 580 }), false)
  assert.equal(coversPlan(600, { startSec: 600, endSec: 660 }), false)
  assert.equal(coversPlan(600, { startSec: 600, endSec: 659 }), true)
})

test('sourceExtractArgs seeks accurately and re-encodes lightly', () => {
  const args = sourceExtractArgs('https://x/index.m3u8', { startSec: 540, durationSec: 120 }, 'out.mp4')
  assert.deepEqual(args.slice(0, 6), ['-ss', '540', '-t', '120', '-i', 'https://x/index.m3u8'])
  assert.ok(args.includes('ultrafast') && args.includes('libx264') && args.at(-1) === 'out.mp4')
})

test('extractSources writes only what is missing, publishes complete files only and reports failures', async () => {
  const base = mkdtempSync(join(tmpdir(), 'clippeak-src-'))
  const calls: string[] = []
  const run = async (args: string[]) => {
    const out = args.at(-1) as string
    calls.push(out)
    if (out.includes('bad')) throw new Error('ffmpeg a echoue')
    writeFileSync(out, 'video')
  }
  const first = await extractSources({ vodId: 'v1', moments: [{ id: 'm1', peakSec: 100 }, { id: 'bad', peakSec: 200 }], baseDir: base, videoUrl: 'u', run })
  assert.deepEqual([first.saved, first.alreadyThere, first.failed], [1, 0, ['bad']])
  assert.equal(existsSync(join(base, sourceRelPath('v1', 'm1'))), true)
  assert.equal(existsSync(join(base, sourceRelPath('v1', 'bad'))), false)
  assert.equal(existsSync(join(base, 'sources/v1/m1.part.mp4')), false)
  const second = await extractSources({ vodId: 'v1', moments: [{ id: 'm1', peakSec: 100 }, { id: 'm2', peakSec: 300 }], baseDir: base, videoUrl: 'u', run })
  assert.deepEqual([second.saved, second.alreadyThere, second.failed], [1, 1, []])
})

test('purgeOldSources removes only folders older than the limit', async () => {
  const base = mkdtempSync(join(tmpdir(), 'clippeak-purge-'))
  for (const name of ['vieux', 'recent']) mkdirSync(join(base, 'sources', name), { recursive: true })
  const old = new Date(Date.now() - 20 * 24 * 3600 * 1000)
  utimesSync(join(base, 'sources', 'vieux'), old, old)
  assert.equal(await purgeOldSources(base, 14), 1)
  assert.equal(existsSync(join(base, 'sources', 'vieux')), false)
  assert.equal(existsSync(join(base, 'sources', 'recent')), true)
  assert.equal(await purgeOldSources(join(base, 'absent')), 0)
})

test('checkVodReadable tells readable, restricted and unknown apart', async () => {
  const fake = (usher: () => Response) => (async (url: any) => {
    const u = String(url)
    if (u.includes('gql')) return Response.json({ data: { videoPlaybackAccessToken: { value: 'v', signature: 's' } } })
    return usher()
  }) as typeof fetch
  const endpoints = { gql: 'http://x/gql', usher: 'http://x/usher' }
  assert.deepEqual(await checkVodReadable('1', fake(() => new Response('#EXTM3U')), endpoints), { state: 'readable' })
  assert.deepEqual(await checkVodReadable('1', fake(() => Response.json([{ error_code: 'vod_manifest_restricted' }], { status: 403 })), endpoints), { state: 'restricted' })
  const unknown = await checkVodReadable('1', fake(() => new Response('boom', { status: 500 })), endpoints)
  assert.equal(unknown.state, 'unknown')
  const down = await checkVodReadable('1', (async () => { throw new Error('reseau') }) as typeof fetch, endpoints)
  assert.equal(down.state, 'unknown')
})
