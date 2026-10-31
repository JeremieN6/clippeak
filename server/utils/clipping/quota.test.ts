import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clipRoom, DEFAULT_MONTHLY_CLIPS, effectiveQuota, isQuotaExempt, monthStart, nextMonthStart, parseQuotaInput, quotaView } from './quota.ts'

test('mois en UTC : debut et mois suivant, y compris en decembre', () => {
  assert.equal(monthStart(new Date('2026-10-31T23:59:00Z')).toISOString(), '2026-10-01T00:00:00.000Z')
  assert.equal(nextMonthStart(new Date('2026-10-31T23:59:00Z')).toISOString(), '2026-11-01T00:00:00.000Z')
  assert.equal(nextMonthStart(new Date('2026-12-15T10:00:00Z')).toISOString(), '2027-01-01T00:00:00.000Z')
})

test('chaines de demonstration et de test jamais plafonnees', () => {
  assert.equal(isQuotaExempt('demo-clippeak'), true)
  assert.equal(isQuotaExempt('test-joel'), true)
  assert.equal(isQuotaExempt('123456'), false)
  assert.equal(effectiveQuota({ twitchId: 'test-joel', setting: 5 }), null)
})

test('plafond effectif : reglage, defaut, illimite', () => {
  assert.equal(effectiveQuota({ twitchId: '1', setting: 25 }), 25)
  assert.equal(effectiveQuota({ twitchId: '1', setting: null }), null)
  assert.equal(effectiveQuota({ twitchId: '1', setting: undefined }), DEFAULT_MONTHLY_CLIPS)
})

test('offre payante : plus grand entre reglage et offre, jamais moins ; illimite reste illimite', () => {
  assert.equal(effectiveQuota({ twitchId: '1', setting: 40, planClips: 120 }), 120)
  assert.equal(effectiveQuota({ twitchId: '1', setting: 200, planClips: 120 }), 200)
  assert.equal(effectiveQuota({ twitchId: '1', setting: 10, planClips: 0 }), 10)
  assert.equal(effectiveQuota({ twitchId: '1', setting: undefined, planClips: 120 }), 120)
  assert.equal(effectiveQuota({ twitchId: '1', setting: null, planClips: 120 }), null)
  assert.equal(effectiveQuota({ twitchId: 'test-x', setting: 5, planClips: 120 }), null)
})

test('clipRoom : jamais negatif, illimite = Infinity', () => {
  assert.equal(clipRoom(40, 12), 28)
  assert.equal(clipRoom(40, 40), 0)
  assert.equal(clipRoom(40, 55), 0)
  assert.equal(clipRoom(0, 0), 0)
  assert.equal(clipRoom(null, 999), Number.POSITIVE_INFINITY)
})

test('quotaView : atteint, reste, illimite, date de remise a zero', () => {
  const now = new Date('2026-10-20T10:00:00Z')
  assert.deepEqual(quotaView(40, 40, now), { limit: 40, used: 40, remaining: 0, reached: true, resetsAt: '2026-11-01T00:00:00.000Z' })
  assert.equal(quotaView(40, 3, now).remaining, 37)
  assert.deepEqual(quotaView(null, 7, now), { limit: null, used: 7, remaining: null, reached: false, resetsAt: '2026-11-01T00:00:00.000Z' })
})

test('parseQuotaInput : entier 0..1000 ou null, rien d autre', () => {
  assert.deepEqual(parseQuotaInput(40), { ok: true, value: 40 })
  assert.deepEqual(parseQuotaInput(null), { ok: true, value: null })
  for (const bad of [-1, 1001, 1.5, '40', undefined, NaN]) assert.deepEqual(parseQuotaInput(bad), { ok: false })
})
