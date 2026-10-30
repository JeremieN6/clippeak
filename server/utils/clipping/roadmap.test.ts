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

import { resultNote, statusNote, voteLaunchedNote } from './roadmap.ts'

test('notifications : vote lance, resultat selon le vote du streamer, statut', () => {
  assert.match(voteLaunchedNote('TikTok', 'Instagram').body, /TikTok.*Instagram/)
  assert.equal(resultNote('TikTok', 'won').title, 'Ton vote a gagné')
  assert.match(resultNote('TikTok', 'lost').body, /Ton choix reste/)
  assert.doesNotMatch(resultNote('TikTok', 'none').body, /Ton /)
  assert.match(statusNote('Stats', 'delivered')!.title, /livrée/)
  assert.equal(statusNote('Stats', 'backlog'), null)
})
