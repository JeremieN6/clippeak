import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectFraming, framingFromHits, runLocateScript, sampleTimes } from './framingDetect.ts'
import { renderJob } from './clipJobPipeline.ts'
import type { JobContext } from './clipJobPipeline.ts'
import { cropRect } from './clipRender.ts'
import { defaultStyle, parseStyle } from './streamerStyle.ts'

const hit = (x: number, y: number, w: number, h: number, similarity = 0.7) => ({ found: true, similarity, box: { x, y, w, h } })
const miss = { found: false, similarity: 0.2 }

test('framingFromHits uses the median, zooms on small faces, and refuses to guess with too few hits', () => {
  const framing = framingFromHits([hit(0.15, 0.12, 0.05, 0.11), hit(0.16, 0.12, 0.05, 0.11), hit(0.9, 0.8, 0.05, 0.11), miss, miss])!
  assert.ok(Math.abs(framing.centerX - 0.185) < 0.02)
  assert.equal(framing.zoom, 2)
  assert.ok(framing.centerY > 0.17 && framing.centerY < 0.3)

  // grand visage plein cadre : pas de zoom
  assert.equal(framingFromHits([hit(0.4, 0.2, 0.2, 0.5), hit(0.41, 0.2, 0.2, 0.5)])!.zoom, 1)
  // visage minuscule : zoom plafonne
  assert.equal(framingFromHits([hit(0.4, 0.2, 0.01, 0.02), hit(0.4, 0.2, 0.01, 0.02)])!.zoom, 2)
  assert.equal(framingFromHits([hit(0.4, 0.2, 0.2, 0.5), miss, miss]), null)
  assert.equal(framingFromHits([]), null)
  assert.ok(framingFromHits([hit(0.4, 0.2, 0.2, 0.5)], { minHits: 1 }))
})

test('sampleTimes spreads frames inside the clip, away from its edges', () => {
  const times = sampleTimes(100, 130, 5)
  assert.equal(times.length, 5)
  assert.equal(times[0], 101)
  assert.equal(times[4], 129)
  const tight = sampleTimes(10, 10.5, 5)
  assert.equal(tight.length, 5)
  assert.ok(tight.every(t => t > 10 && t < 10.5))
  assert.deepEqual(sampleTimes(10, 10, 5), [10])
  assert.equal(sampleTimes(0, 40, 1).length, 1)
})

test('detectFraming extracts frames, calls the locator with the photos and cleans up its work folder', async () => {
  const extracted: number[] = []
  let cleaned = ''
  let request: any
  const framing = await detectFraming({ videoUrl: 'v.m3u8', startSec: 100, endSec: 130, photos: ['a.jpg', 'b.jpg'] }, {
    extractFrame: async (_url, t) => { extracted.push(t) },
    locate: async (req) => { request = req; return { photos_used: 2, frames: req.frames.map((f, i) => ({ t: f.t, ...(i < 3 ? hit(0.4, 0.2, 0.2, 0.5) : miss) })) } },
    modelsDir: '/models',
    workDir: async () => '/tmp/work',
    cleanup: async (dir) => { cleaned = dir }
  })
  assert.deepEqual(framing, { centerX: 0.5, centerY: 0.55, zoom: 1 })
  assert.equal(extracted.length, 5)
  assert.deepEqual(request.photos, ['a.jpg', 'b.jpg'])
  assert.equal(request.models, '/models')
  assert.equal(cleaned, '/tmp/work')
})

test('detectFraming returns null without photos, when no photo has a face, or when the streamer is not recognised', async () => {
  const base = { videoUrl: 'v', startSec: 0, endSec: 30 }
  const deps = (locate: any) => ({ extractFrame: async () => {}, locate, modelsDir: 'm', workDir: async () => 'w', cleanup: async () => {} })
  assert.equal(await detectFraming({ ...base, photos: [] }, deps(async () => { throw new Error('ne doit pas etre appele') })), null)
  assert.equal(await detectFraming({ ...base, photos: ['a'] }, deps(async () => ({ photos_used: 0, frames: [] }))), null)
  assert.equal(await detectFraming({ ...base, photos: ['a'] }, deps(async () => ({ photos_used: 1, frames: [{ t: 1, ...miss }, { t: 2, ...miss }] }))), null)
})

function fakeChild(exit: { code: number, stdout?: string, stderr?: string }, onStdin?: (data: string) => void) {
  const child: any = new EventEmitter()
  child.pid = 7
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = { end: (data: string) => { onStdin?.(data); setImmediate(() => {
    if (exit.stdout) child.stdout.emit('data', Buffer.from(exit.stdout))
    if (exit.stderr) child.stderr.emit('data', Buffer.from(exit.stderr))
    child.emit('close', exit.code)
  }) } }
  child.kill = () => {}
  return child
}

test('runLocateScript sends the request on stdin at low priority and parses the JSON result', async () => {
  let stdin = ''
  let priority = 0
  const result = await runLocateScript({ photos: ['a.jpg'] }, {
    python: 'py', script: '/s/locate.py',
    spawnFn: (() => fakeChild({ code: 0, stdout: 'warning\n{"photos_used":1,"frames":[]}\n' }, d => { stdin = d })) as any,
    setPriorityFn: (_pid, p) => { priority = p }
  })
  assert.deepEqual(JSON.parse(stdin), { photos: ['a.jpg'] })
  assert.ok(priority > 0)
  assert.equal(result.photos_used, 1)
})

test('runLocateScript explains failures and a missing python', async () => {
  await assert.rejects(runLocateScript({}, { spawnFn: (() => fakeChild({ code: 1, stderr: 'ModuleNotFoundError: cv2' })) as any, setPriorityFn: () => {} }), /cv2/)
  await assert.rejects(runLocateScript({}, { python: 'python-qui-n-existe-pas', setPriorityFn: () => {} }), /impossible/)
  await assert.rejects(runLocateScript({}, { spawnFn: (() => fakeChild({ code: 0, stdout: 'pas du json' })) as any, setPriorityFn: () => {} }), /echec|illisible/)
})

const words = (list: string[], from: number, step = 0.45) => list.map((text, i) => ({ text, start: from + i * step, end: from + i * step + 0.35 }))

function context(overrides: Partial<JobContext> = {}): JobContext {
  const w = [...words(['Alors', 'hier', 'je', 'suis', 'alle', 'au', 'marche.'], 20), ...words(['Et', 'le', 'mec', 'me', 'dit', 'rien', 'du', 'tout', 'mdr.'], 24)]
  return {
    jobId: 'j', channelName: 'Streamer', vodTwitchId: '1', peakSec: 29,
    transcript: [{ start: 20, end: 28, text: 'x', words: w }], hook: 'Alors hier je suis alle au marche', category: null, title: null, plan: null,
    settings: { keywords: [], clipMinSec: 8, clipMaxSec: 25, subtitles: true, accentColor: '#FFFFFF', highlightColor: '#FFD400' },
    style: parseStyle({ framing: { auto: true, centerX: 0.5, centerY: 0.5, zoom: 1 } }), assets: {}, library: [], photoPaths: ['/p/a.jpg'], ...overrides
  }
}

const goodMetrics = async () => ({ width: 1080, height: 1920, videoSec: 12, audioSec: 12, freezeAtEndSec: null, leadingSilenceSec: 0, trailingSilenceSec: 0 })

test('renderJob crops on the detected streamer and warns when he is not recognised', async () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'cw-frame-'))
  try {
    const seen: string[] = []
    const base = { getVideoUrl: async () => 'v.m3u8', runFfmpeg: async (args: string[]) => { seen.push(args.join(' ')); return '' }, collectMetrics: goodMetrics, outputDir }

    const detected = { centerX: 0.2, centerY: 0.2, zoom: 2.5 }
    const ok = await renderJob(context(), { ...base, detectFraming: async () => detected })
    const expected = cropRect(1280, 720, detected)
    assert.ok(seen[0].includes(`crop=${expected.w}:${expected.h}:${expected.x}:${expected.y}`))
    assert.equal(ok.qc.issues.some(i => i.code === 'framing'), false)

    const lost = await renderJob(context(), { ...base, detectFraming: async () => null })
    const manual = cropRect(1280, 720, { centerX: 0.5, centerY: 0.5, zoom: 1 })
    assert.ok(seen[1].includes(`crop=${manual.w}:${manual.h}:${manual.x}:${manual.y}`))
    assert.deepEqual(lost.qc.issues.filter(i => i.code === 'framing').map(i => i.severity), ['warning'])
    assert.equal(lost.qc.passed, true)

    const noPhotos = await renderJob(context({ photoPaths: [] }), { ...base, detectFraming: async () => { throw new Error('ne doit pas etre appele') } })
    assert.match(noPhotos.qc.issues.find(i => i.code === 'framing')!.message, /aucune photo/)

    const off = await renderJob(context({ style: defaultStyle() }), { ...base, detectFraming: async () => { throw new Error('ne doit pas etre appele') } })
    assert.equal(off.qc.issues.some(i => i.code === 'framing'), false)

    const failing = await renderJob(context(), { ...base, detectFraming: async () => { throw new Error('python absent') } })
    assert.equal(failing.qc.issues.some(i => i.code === 'framing'), true)
  } finally {
    rmSync(outputDir, { recursive: true, force: true })
  }
})
