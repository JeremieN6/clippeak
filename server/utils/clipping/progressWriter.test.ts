import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createProgressWriter } from './progressWriter.ts'
import { runFfmpeg } from './ffmpegRunner.ts'
import { renderLongJob } from './longRender.ts'

test('progress writer: writes at most once per gap, only upward, never 100 before done()', async () => {
  let clock = 0
  const written: number[] = []
  const writer = createProgressWriter(async (p) => { written.push(p) }, { minGapMs: 2000, now: () => clock })
  writer.report(0.0)
  writer.report(0.05) // trop tot : moins de 2 s apres la premiere ecriture
  clock = 2500
  writer.report(0.05)
  writer.report(0.04) // en arriere : ignore
  clock = 5000
  writer.report(1.2) // plafonne a 99
  clock = 8000
  writer.report(Number.NaN)
  await writer.done()
  assert.deepEqual(written, [0, 5, 99, 100])
})

test('progress writer: a failing write never breaks the render', async () => {
  const writer = createProgressWriter(async () => { throw new Error('base injoignable') }, { minGapMs: 0 })
  writer.report(0.5)
  await writer.done()
})

function fakeSpawn(stderrChunks: string[], code = 0) {
  const calls: string[][] = []
  const spawnFn = ((_command: string, args: string[]) => {
    calls.push(args)
    const child: any = new EventEmitter()
    child.pid = undefined
    child.kill = () => {}
    child.stderr = new EventEmitter()
    setImmediate(() => {
      for (const chunk of stderrChunks) child.stderr.emit('data', Buffer.from(chunk))
      child.emit('close', code)
    })
    return child
  }) as any
  return { spawnFn, calls }
}

test('runFfmpeg reports the seconds of video produced and keeps progress lines out of the error tail', async () => {
  const seen: number[] = []
  const { spawnFn, calls } = fakeSpawn(['frame=10\nout_time_us=1500000\nprogress=continue\n', 'out_time_us=12000000\nspeed=2x\nprogress=end\nreal ffmpeg warning\n'])
  const tail = await runFfmpeg(['-i', 'in.mp4', 'out.mp4'], { spawnFn, lowPriority: false, onProgress: s => seen.push(s) })
  assert.deepEqual(seen, [1.5, 12])
  assert.ok(calls[0].includes('-progress') && calls[0].includes('pipe:2'))
  assert.equal(tail.trim(), 'real ffmpeg warning')
})

test('runFfmpeg without a progress callback does not change the command', async () => {
  const { spawnFn, calls } = fakeSpawn([])
  await runFfmpeg(['a'], { spawnFn, lowPriority: false })
  assert.ok(!calls[0].includes('-progress'))
})

test('renderLongJob turns produced seconds into a fraction of the chosen passage', async () => {
  const fractions: number[] = []
  await renderLongJob({ jobId: 'j', vodTwitchId: '1', startSec: 100, endSec: 400, maxSec: 600 }, {
    getVideoUrl: async () => 'u',
    runFfmpeg: async (_args, options) => { options?.onProgress?.(75); options?.onProgress?.(400); return '' },
    probe: () => ({ width: 1280, height: 720, videoSec: 300, audioSec: 300 }),
    outputDir: process.env.TEMP ?? '/tmp',
    onProgress: f => fractions.push(f)
  })
  assert.deepEqual(fractions, [0.25, 1])
})
