import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { runClipWorker } from './clipQueue.ts'
import type { ClipJobToRender, ClipQueueStore } from './clipQueue.ts'
import { FfmpegError, runFfmpeg } from './ffmpegRunner.ts'

const job = (id: string): ClipJobToRender => ({ id, momentId: `m-${id}`, title: null })

function fakeStore(queue: ClipJobToRender[], options: { requeued?: number, claimFailsOnce?: boolean, markFailedThrows?: boolean } = {}) {
  const events: string[] = []
  let claimFailed = false
  const store: ClipQueueStore = {
    requeueInterrupted: async () => { events.push('requeue'); return options.requeued ?? 0 },
    claimNext: async () => {
      if (options.claimFailsOnce && !claimFailed) { claimFailed = true; throw new Error('db down') }
      const next = queue.shift() ?? null
      if (next) events.push(`claim ${next.id}`)
      return next
    },
    markReview: async (id, path) => { events.push(`review ${id} ${path}`) },
    markFailed: async (id, error) => {
      if (options.markFailedThrows) throw new Error('db down')
      events.push(`failed ${id} ${error}`)
    }
  }
  return { store, events }
}

// Arrete le worker quand la file est vide, au deuxieme sommeil.
function stopWhenIdle() {
  let sleeps = 0
  return {
    sleep: async () => { sleeps++ },
    shouldStop: () => sleeps >= 1
  }
}

test('worker requeues interrupted renders at startup, then renders jobs one at a time in order', async () => {
  const { store, events } = fakeStore([job('a'), job('b')], { requeued: 1 })
  let running = 0
  let maxRunning = 0
  const idle = stopWhenIdle()
  const summary = await runClipWorker({
    store,
    ...idle,
    render: async (j) => {
      running++
      maxRunning = Math.max(maxRunning, running)
      await new Promise(r => setImmediate(r))
      running--
      return { outputPath: `/out/${j.id}.mp4` }
    }
  })
  assert.deepEqual(summary, { done: 2, failed: 0 })
  assert.equal(maxRunning, 1)
  assert.deepEqual(events, ['requeue', 'claim a', 'review a /out/a.mp4', 'claim b', 'review b /out/b.mp4'])
})

test('a failing render marks the job failed with a truncated message and the worker keeps going', async () => {
  const { store, events } = fakeStore([job('bad'), job('ok')])
  const idle = stopWhenIdle()
  const summary = await runClipWorker({
    store,
    ...idle,
    render: async (j) => {
      if (j.id === 'bad') throw new Error('x'.repeat(5000))
      return { outputPath: '/out/ok.mp4' }
    }
  })
  assert.deepEqual(summary, { done: 1, failed: 1 })
  const failed = events.find(e => e.startsWith('failed bad'))!
  assert.ok(failed.length < 2100)
  assert.ok(events.includes('review ok /out/ok.mp4'))
})

test('a queue read error backs off instead of crashing, and a markFailed error is survivable', async () => {
  const { store } = fakeStore([job('a')], { claimFailsOnce: true, markFailedThrows: true })
  const sleeps: number[] = []
  let calls = 0
  const summary = await runClipWorker({
    store,
    render: async () => { throw new Error('boom') },
    sleep: async (ms) => { sleeps.push(ms) },
    shouldStop: () => ++calls > 4,
    errorBackoffMs: 777,
    log: () => {}
  })
  assert.equal(sleeps[0], 777)
  assert.deepEqual(summary, { done: 0, failed: 1 })
})

test('worker stops promptly when asked, without claiming a new job', async () => {
  const { store, events } = fakeStore([job('a')])
  const summary = await runClipWorker({ store, render: async () => ({ outputPath: 'x' }), shouldStop: () => true })
  assert.deepEqual(summary, { done: 0, failed: 0 })
  assert.deepEqual(events, ['requeue'])
})

function fakeChild(exit: { code: number | null, stderr?: string, never?: boolean }) {
  const child: any = new EventEmitter()
  child.pid = 4242
  child.stderr = new EventEmitter()
  child.kill = (signal: string) => { child.killedWith = signal; setImmediate(() => child.emit('close', null)) }
  if (!exit.never) {
    setImmediate(() => {
      if (exit.stderr) child.stderr.emit('data', Buffer.from(exit.stderr))
      child.emit('close', exit.code)
    })
  }
  return child
}

test('runFfmpeg lowers the priority, passes safe flags and resolves on exit 0', async () => {
  const seen: { args?: string[], priority?: [number, number] } = {}
  await runFfmpeg(['-i', 'in.mp4', 'out.mp4'], {
    spawnFn: ((_cmd: string, args: string[]) => { seen.args = args; return fakeChild({ code: 0 }) }) as any,
    setPriorityFn: (pid, priority) => { seen.priority = [pid, priority] }
  })
  assert.deepEqual(seen.args, ['-nostdin', '-hide_banner', '-y', '-i', 'in.mp4', 'out.mp4'])
  assert.equal(seen.priority?.[0], 4242)
  assert.ok(seen.priority![1] > 0)
})

test('runFfmpeg reports failures with the end of stderr and survives a priority error', async () => {
  await assert.rejects(
    runFfmpeg(['x'], {
      spawnFn: (() => fakeChild({ code: 1, stderr: 'line1\nInvalid data found\nConversion failed!' })) as any,
      setPriorityFn: () => { throw new Error('EPERM') }
    }),
    (e: any) => e instanceof FfmpegError && e.code === 1 && /Conversion failed/.test(e.message)
  )
})

test('runFfmpeg kills a render that exceeds its timeout', async () => {
  let child: any
  await assert.rejects(
    runFfmpeg(['x'], {
      spawnFn: (() => (child = fakeChild({ code: null, never: true }))) as any,
      setPriorityFn: () => {},
      timeoutMs: 20
    }),
    (e: any) => e instanceof FfmpegError && /interrompu/.test(e.message)
  )
  assert.equal(child.killedWith, 'SIGKILL')
})

test('runFfmpeg explains a missing binary', async () => {
  await assert.rejects(
    runFfmpeg(['-version'], { binary: 'ffmpeg-qui-n-existe-pas', setPriorityFn: () => {} }),
    (e: any) => e instanceof FfmpegError && /introuvable/.test(e.message)
  )
})

test('idle task runs when the queue is empty and skips the sleep when it did work', async () => {
  const { store } = fakeStore([])
  const calls: string[] = []
  let ticks = 0
  await runClipWorker({
    store,
    render: async () => ({ outputPath: 'x' }),
    idleTask: async () => { calls.push('idle'); return calls.length < 3 },
    sleep: async () => { calls.push('sleep') },
    shouldStop: () => ++ticks > 4,
    log: () => {}
  })
  assert.deepEqual(calls.slice(0, 4), ['idle', 'idle', 'idle', 'sleep'])
})

test('an idle task error is logged and the worker keeps polling', async () => {
  const { store } = fakeStore([])
  const logs: string[] = []
  let ticks = 0
  await runClipWorker({
    store,
    render: async () => ({ outputPath: 'x' }),
    idleTask: async () => { throw new Error('boom') },
    sleep: async () => {},
    shouldStop: () => ++ticks > 2,
    log: (m) => { logs.push(m) }
  })
  assert.ok(logs.some(l => /tache de fond/.test(l)))
})
