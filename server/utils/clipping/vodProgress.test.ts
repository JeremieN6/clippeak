import test from 'node:test'
import assert from 'node:assert/strict'
import { analysisEstimateSec, vodProgress } from './vodProgress.ts'

const none = { queued: 0, rendering: 0, review: 0, approved: 0, rejected: 0, failed: 0 }

test('analysis estimate grows with the VOD length', () => {
  assert.equal(analysisEstimateSec(0), 120)
  assert.equal(analysisEstimateSec(3 * 3600), 120 + 270)
  assert.ok(analysisEstimateSec(6 * 3600) > analysisEstimateSec(3 * 3600))
})

test('vodProgress tells where a VOD stands and how long is left', () => {
  assert.deepEqual(vodProgress('ended', 3600, none), { phase: 'waiting', estimateSec: 210, clipsTotal: 0, clipsInProgress: 0 })
  assert.equal(vodProgress('analyzing', 3600, none).phase, 'analyzing')
  const rendering = vodProgress('done', 3600, { ...none, queued: 3, rendering: 1, review: 3 })
  assert.deepEqual(rendering, { phase: 'rendering', estimateSec: 120, clipsTotal: 7, clipsInProgress: 4 })
  const ready = vodProgress('done', 3600, { ...none, review: 5, failed: 2 })
  assert.deepEqual(ready, { phase: 'ready', estimateSec: null, clipsTotal: 7, clipsInProgress: 0 })
  assert.equal(vodProgress('done', 3600, none).phase, 'ready')
  assert.equal(vodProgress('failed', 3600, { ...none, queued: 2 }).phase, 'failed')
})
