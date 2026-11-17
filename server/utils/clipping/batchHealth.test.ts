import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateBatch, openUntilAfterAdd, type BatchChannel } from './batchHealth.ts'
import type { Sample } from './capacity.ts'

const calm: Sample = { load1: 0.3, load5: 0.3, cores: 2, memTotalMb: 8000, memFreeMb: 5000, clipsQueued: 0, clipsRendering: 0, analysesQueued: 0, analysesRunning: 0, oldestWaitSec: null }
const busy: Sample = { ...calm, load1: 4 }
const many = (n: number, s: Sample) => Array.from({ length: n }, () => s)
const ch = (ageHours: number | null, firstClipHours: number | null): BatchChannel => ({ ageHours, firstClipHours })

test('ajout de places : on ajoute aux places libres, jamais un total a retenir', () => {
  assert.equal(openUntilAfterAdd(11, 11, 10), 21) // plafond atteint : +10
  assert.equal(openUntilAfterAdd(11, 6, 10), 21) // 5 places libres + 10 = 15 libres
  assert.equal(openUntilAfterAdd(0, 11, 10), 21) // coupe : on repart des places prises
  assert.equal(openUntilAfterAdd(5, 11, 10), 21) // plafond deja depasse
  assert.equal(openUntilAfterAdd(11, 11, -4), 11)
})

test('lot sain : 8 sur 10 avec un clip en moins de 24 h et serveur calme', () => {
  const channels = [...Array(8)].map(() => ch(30, 3)).concat([ch(30, null), ch(30, 40)])
  const h = evaluateBatch(channels, many(100, calm), 10)
  assert.equal(h.ok, true)
  assert.equal(h.good, 8)
  assert.equal(h.evaluated, 10)
})

test('trop tot : chaines sans live ou live enregistre depuis moins de 24 h ne comptent pas', () => {
  const channels = [ch(2, null), ch(10, 1), ch(null, null), ch(30, 3), ch(30, 3), ch(null, null)]
  const h = evaluateBatch(channels, many(100, calm), 10)
  assert.equal(h.ok, false)
  assert.equal(h.reason, 'too_early')
  assert.equal(h.evaluated, 2)
  assert.equal(h.needed, 6)
})

test('clips trop lents : moins de 80 % des chaines jugees ont un premier clip en 24 h', () => {
  const channels = [...Array(7)].map(() => ch(30, 3)).concat([ch(30, null), ch(30, null), ch(30, 50)])
  const h = evaluateBatch(channels, many(100, calm), 10)
  assert.equal(h.ok, false)
  assert.equal(h.reason, 'slow_clips')
})

test('serveur charge ou sans mesure : on n ouvre pas', () => {
  const channels = [...Array(10)].map(() => ch(30, 3))
  assert.equal(evaluateBatch(channels, [...many(80, calm), ...many(20, busy)], 10).reason, 'server')
  assert.equal(evaluateBatch(channels, [], 10).reason, 'server')
  assert.equal(evaluateBatch(channels, [...many(92, calm), ...many(8, busy)], 10).ok, true)
})

test('petit lot : au moins 3 chaines jugees', () => {
  assert.equal(evaluateBatch([ch(30, 2), ch(30, 2)], many(50, calm), 3).reason, 'too_early')
  assert.equal(evaluateBatch([ch(30, 2), ch(30, 2), ch(30, 2)], many(50, calm), 3).ok, true)
})
