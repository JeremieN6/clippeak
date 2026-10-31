import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONSENT_MAX_AGE_MS, parseConsent, serializeConsent } from './consent.ts'

const now = 1_800_000_000_000

test('rien de stocke ou illisible : pas encore decide', () => {
  for (const raw of [null, undefined, '', 'granted', '{', '{"v":"yes","at":1}', '{"v":"granted"}', '{"v":"granted","at":"x"}', '[]']) {
    assert.equal(parseConsent(raw as any, now), 'pending', String(raw))
  }
})

test('accepte et refuse sont relus tels quels', () => {
  assert.equal(parseConsent(serializeConsent('granted', now), now), 'granted')
  assert.equal(parseConsent(serializeConsent('denied', now), now), 'denied')
})

test('le choix expire apres 6 mois (accepte comme refuse) et une date du futur est refusee', () => {
  const old = serializeConsent('granted', now - CONSENT_MAX_AGE_MS - 1)
  assert.equal(parseConsent(old, now), 'pending')
  assert.equal(parseConsent(serializeConsent('denied', now - CONSENT_MAX_AGE_MS - 1), now), 'pending')
  assert.equal(parseConsent(serializeConsent('granted', now - CONSENT_MAX_AGE_MS + 1000), now), 'granted')
  assert.equal(parseConsent(serializeConsent('granted', now + 3_600_000), now), 'pending')
})
