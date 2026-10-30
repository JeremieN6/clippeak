import test from 'node:test'
import assert from 'node:assert/strict'
import { isDue, outcome, tally } from './roadmap.ts'

const v = (featureId: string) => ({ featureId })

test('un vote = +1 pour sa fonction', () => {
  assert.deepEqual(tally([v('A'), v('A'), v('B')], 'A', 'B'), { a: 2, b: 1 })
})

test('les votes reportes de la fonction qui a deja perdu comptent en plus', () => {
  assert.deepEqual(tally([v('A'), v('B')], 'A', 'B', 0, 3), { a: 1, b: 4 })
})

test('la fonction la plus votee gagne, egalite et zero vote = l admin tranche', () => {
  assert.equal(outcome({ a: 3, b: 1 }), 'a')
  assert.equal(outcome({ a: 1, b: 2 }), 'b')
  assert.equal(outcome({ a: 2, b: 2 }), 'tie')
  assert.equal(outcome({ a: 0, b: 0 }), 'tie')
})

test('echeance : due a l heure pile et apres, pas avant', () => {
  const now = new Date('2026-11-01T10:00:00Z')
  assert.equal(isDue(new Date('2026-11-01T10:00:00Z'), now), true)
  assert.equal(isDue(new Date('2026-11-01T09:59:59Z'), now), true)
  assert.equal(isDue(new Date('2026-11-01T10:00:01Z'), now), false)
})
