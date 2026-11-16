import test from 'node:test'
import assert from 'node:assert/strict'
import { AVG_AHEAD_VOD_SEC, computeStartProgress, startMessage } from './startProgress.ts'
import type { StartInput, StartVod } from './startProgress.ts'

const vod = (over: Partial<StartVod> = {}): StartVod => ({ status: 'ended', durationSec: 3 * 3600, title: 'Soirée GTA', transcribedSec: null, finished: false, ...over })
const input = (over: Partial<StartInput> = {}): StartInput => ({ vods: [vod()], clips: { queued: 0, rendering: 0, ready: 0 }, queue: { vodsAhead: 0, clipsAhead: 0 }, quotaReached: false, ...over })

test('aucun live recent : phase « none », pas de delai annonce', () => {
  const p = computeStartProgress(input({ vods: [] }))
  assert.equal(p.phase, 'none')
  assert.equal(p.etaSec, null)
  assert.match(startMessage(p).text, /prochain direct/)
})

test('live en file, serveur au repos : delai court et arrondi a 5 minutes', () => {
  const p = computeStartProgress(input())
  assert.equal(p.phase, 'waiting')
  assert.ok(p.etaSec! >= 5 * 60 && p.etaSec! <= 30 * 60, `eta ${p.etaSec}`)
  assert.equal(p.etaSec! % 300, 0)
  assert.match(startMessage(p).text, /Premiers clips dans environ \d+ minutes/)
})

test('la file des autres chaines allonge le delai annonce (on ne promet pas ce que le serveur ne tient pas)', () => {
  const quiet = computeStartProgress(input())
  const busy = computeStartProgress(input({ queue: { vodsAhead: 20, clipsAhead: 20 } }))
  assert.ok(busy.etaSec! > quiet.etaSec! + 20 * AVG_AHEAD_VOD_SEC * 0.9)
  assert.match(startMessage(busy).text, /plusieurs heures/)
})

test('analyse deja commencee : on n\'ajoute plus la file devant', () => {
  const waiting = computeStartProgress(input({ queue: { vodsAhead: 10, clipsAhead: 0 } }))
  const reading = computeStartProgress(input({ vods: [vod({ status: 'analyzing' })], queue: { vodsAhead: 10, clipsAhead: 0 } }))
  assert.equal(reading.phase, 'analyzing')
  assert.ok(reading.etaSec! < waiting.etaSec!)
})

test('des clips en montage : phase « rendering », delai fonde sur le premier lot de 4', () => {
  const p = computeStartProgress(input({ vods: [vod({ status: 'done', finished: true })], clips: { queued: 6, rendering: 1, ready: 0 } }))
  assert.equal(p.phase, 'rendering')
  assert.equal(p.etaSec, 5 * 60)
})

test('des clips prets : phase « ready » quoi qu\'il reste a faire', () => {
  const p = computeStartProgress(input({ clips: { queued: 3, rendering: 0, ready: 1 }, quotaReached: true }))
  assert.equal(p.phase, 'ready')
})

test('live reserve aux abonnes : phase « blocked », aucun delai promis', () => {
  const p = computeStartProgress(input({ vods: [vod({ status: 'blocked' })] }))
  assert.equal(p.phase, 'blocked')
  assert.equal(p.etaSec, null)
  assert.match(startMessage(p).text, /public/)
})

test('un live bloque et un autre en cours : on attend le second', () => {
  const p = computeStartProgress(input({ vods: [vod({ status: 'blocked' }), vod({ status: 'analyzing' })] }))
  assert.equal(p.phase, 'analyzing')
})

test('analyse en echec : phase « failed »', () => {
  assert.equal(computeStartProgress(input({ vods: [vod({ status: 'failed' })] })).phase, 'failed')
})

test('lives lus sans aucun clip : phase « empty », on ne laisse pas attendre pour rien', () => {
  const p = computeStartProgress(input({ vods: [vod({ status: 'done', finished: true })] }))
  assert.equal(p.phase, 'empty')
  assert.equal(p.etaSec, null)
})

test('live fini mais lecture par le contenu en cours : on attend encore', () => {
  const p = computeStartProgress(input({ vods: [vod({ status: 'done', finished: false, transcribedSec: 1800 })] }))
  assert.equal(p.phase, 'analyzing')
})

test('plafond atteint sans aucun clip : phase « paused »', () => {
  assert.equal(computeStartProgress(input({ quotaReached: true })).phase, 'paused')
})

test('un live tres long ne rallonge pas l\'annonce du premier lot au-dela de 3 h de lecture', () => {
  const a = computeStartProgress(input({ vods: [vod({ durationSec: 3 * 3600 })] }))
  const b = computeStartProgress(input({ vods: [vod({ durationSec: 12 * 3600 })] }))
  assert.equal(a.etaSec, b.etaSec)
})
