import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALERT_LOAD_SAMPLES, alertReason, parseMemAvailableMb, percentile, recommendation, summarize, verdictOf, type Sample } from './capacity.ts'

const base: Sample = { load1: 0.4, load5: 0.4, cores: 2, memTotalMb: 8000, memFreeMb: 5000, clipsQueued: 0, clipsRendering: 0, analysesQueued: 0, analysesRunning: 0, oldestWaitSec: null }

test('verdict : ok, attention, sature selon la charge (en coeurs), l attente et la memoire', () => {
  assert.equal(verdictOf(base), 'ok')
  assert.equal(verdictOf({ ...base, load1: 2.4 }), 'attention') // 1,2 fois les coeurs
  assert.equal(verdictOf({ ...base, load1: 3.2 }), 'sature') // 1,6 fois
  assert.equal(verdictOf({ ...base, oldestWaitSec: 11 * 60 }), 'attention')
  assert.equal(verdictOf({ ...base, oldestWaitSec: 21 * 60 }), 'sature')
  assert.equal(verdictOf({ ...base, memFreeMb: 300 }), 'sature')
  assert.equal(verdictOf({ ...base, memFreeMb: 700, memTotalMb: 16000 }), 'sature') // moins de 8 %
  assert.equal(verdictOf({ ...base, load1: 4, cores: 4 }), 'ok') // exactement le nombre de coeurs : pas encore de file
  assert.equal(verdictOf({ ...base, load1: 4.5, cores: 4 }), 'attention')
})

test('alerte : 5 mesures de suite saturees, ou attente de plus de 15 minutes, ou memoire presque pleine ; sinon rien', () => {
  const hot = { ...base, load1: 3.5 }
  assert.equal(alertReason([]), null)
  assert.equal(alertReason([hot, hot, hot, hot]), null) // pas assez de mesures
  const charge = alertReason(Array.from({ length: ALERT_LOAD_SAMPLES }, () => hot))
  assert.equal(charge?.kind, 'charge')
  assert.match(charge!.message, /3,5 pour 2 coeurs/)
  assert.equal(alertReason([hot, hot, hot, base, hot]), null) // une mesure normale interrompt la serie
  assert.equal(alertReason([{ ...base, oldestWaitSec: 16 * 60, clipsQueued: 3 }])?.kind, 'attente')
  assert.equal(alertReason([{ ...base, memFreeMb: 200 }])?.kind, 'memoire')
  assert.equal(alertReason([base, base, base, base, base]), null)
})

test('memoire disponible lue dans /proc/meminfo', () => {
  assert.equal(parseMemAvailableMb('MemTotal:  8000000 kB\nMemFree:  100000 kB\nMemAvailable:  5242880 kB\n'), 5120)
  assert.equal(parseMemAvailableMb('MemTotal: 1 kB'), null)
})

test('percentiles et resume : vide, un element, plusieurs, valeurs non numeriques ignorees', () => {
  assert.deepEqual(summarize([]), { n: 0, median: null, p90: null, max: null })
  assert.deepEqual(summarize([7]), { n: 1, median: 7, p90: 7, max: 7 })
  const s = summarize([10, 20, 30, 40, 100, Number.NaN])
  assert.equal(s.n, 5)
  assert.equal(s.median, 30)
  assert.equal(s.max, 100)
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5)
})

test('conseil : sans mesure, serveur souvent sature, a surveiller, rien a faire', () => {
  assert.match(recommendation({ verdict: null, saturatedShare: null, waitP90Sec: null, samples: 0 }), /Aucune mesure/)
  assert.match(recommendation({ verdict: 'ok', saturatedShare: 0.2, waitP90Sec: 30, samples: 500 }), /KVM 4/)
  assert.match(recommendation({ verdict: 'ok', saturatedShare: 0, waitP90Sec: 20 * 60, samples: 500 }), /KVM 4/)
  assert.match(recommendation({ verdict: 'attention', saturatedShare: 0, waitP90Sec: 30, samples: 500 }), /surveiller/)
  assert.match(recommendation({ verdict: 'ok', saturatedShare: 0, waitP90Sec: 30, samples: 500 }), /Rien à faire/)
})
