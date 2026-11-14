import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LONG_ACCESS_CHANNEL_FILTER, LONG_LOCKED_MESSAGE, canUseLongExtracts } from './longAccess.ts'
import { PAYING_STATUSES } from './billing.ts'

test('extraits longs : reserves a l offre Creator, aux chaines de test et de demo, et aux chaines illimitees par l admin', () => {
  const free = { twitchId: '123', billingStatus: null, quotaSetting: 20 }
  assert.equal(canUseLongExtracts(free), false)
  assert.equal(canUseLongExtracts({ ...free, quotaSetting: undefined }), false) // pas de ligne de reglages : plafond par defaut, donc gratuit
  for (const status of ['active', 'trialing', 'past_due']) assert.equal(canUseLongExtracts({ ...free, billingStatus: status }), true, status)
  for (const status of ['canceled', 'unpaid', 'incomplete', 'paused', undefined, null]) assert.equal(canUseLongExtracts({ ...free, billingStatus: status as any }), false, String(status))
  assert.equal(canUseLongExtracts({ ...free, twitchId: 'test-joel' }), true)
  assert.equal(canUseLongExtracts({ ...free, twitchId: 'demo-clippeak' }), true)
  assert.equal(canUseLongExtracts({ ...free, quotaSetting: null }), true) // illimite accorde par l'admin
  assert.equal(canUseLongExtracts({ ...free, quotaSetting: 999 }), false) // un plafond releve n'est pas une offre
})

test('filtre de la base = meme regle (offre payante, demo, test, illimite) ; message clair', () => {
  assert.deepEqual(PAYING_STATUSES, ['active', 'trialing', 'past_due'])
  const filter = JSON.stringify(LONG_ACCESS_CHANNEL_FILTER)
  for (const part of ['"in":["active","trialing","past_due"]', '"demo-clippeak"', '"startsWith":"test-"', '"monthlyClipQuota":null']) assert.ok(filter.includes(part), part)
  assert.match(LONG_LOCKED_MESSAGE, /Creator/)
})
