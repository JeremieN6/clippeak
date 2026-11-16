import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clipRoom, DEFAULT_MONTHLY_CLIPS, effectiveQuota, isQuotaExempt, liveLimit, liveQuotaView, liveRoom, monthStart, nextMonthStart, parseQuotaInput, quotaMode, quotaView } from './quota.ts'

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
  assert.equal(DEFAULT_MONTHLY_CLIPS, 20) // gratuit : 20 clips par mois
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
  assert.deepEqual(quotaView(40, 40, now), { limit: 40, used: 40, remaining: 0, reached: true, resetsAt: '2026-11-01T00:00:00.000Z', bonus: 0, unit: 'clips', clipsUsed: 40 })
  assert.equal(quotaView(40, 3, now).remaining, 37)
  assert.deepEqual(quotaView(null, 7, now), { limit: null, used: 7, remaining: null, reached: false, resetsAt: '2026-11-01T00:00:00.000Z', bonus: 0, unit: 'clips', clipsUsed: 7 })
})

test('parseQuotaInput : entier 0..1000 ou null, rien d autre', () => {
  assert.deepEqual(parseQuotaInput(40), { ok: true, value: 40 })
  assert.deepEqual(parseQuotaInput(null), { ok: true, value: null })
  for (const bad of [-1, 1001, 1.5, '40', undefined, NaN]) assert.deepEqual(parseQuotaInput(bad), { ok: false })
})

test('bonus de parrainage : s’ajoute au plafond, sans offre payante, jamais aux chaines illimitees ou exemptees', () => {
  assert.equal(effectiveQuota({ twitchId: '1', setting: undefined, bonusClips: 5 }), 25)
  assert.equal(effectiveQuota({ twitchId: '1', setting: 40, planClips: 120, bonusClips: 25 }), 145)
  assert.equal(effectiveQuota({ twitchId: '1', setting: null, bonusClips: 5 }), null)
  assert.equal(effectiveQuota({ twitchId: 'test-x', setting: 5, bonusClips: 5 }), null)
  assert.equal(effectiveQuota({ twitchId: '1', setting: 20, bonusClips: -4 }), 20)
  assert.equal(quotaView(25, 25, new Date('2026-10-05T00:00:00Z'), 5).bonus, 5)
})

import { quotaLevel } from './quota.ts'

test('niveau du plafond : message court a 80 %, complet a 100 %, rien en illimite', () => {
  assert.equal(quotaLevel({ limit: 20, used: 15 }), 'ok')
  assert.equal(quotaLevel({ limit: 20, used: 16 }), 'near')
  assert.equal(quotaLevel({ limit: 20, used: 19 }), 'near')
  assert.equal(quotaLevel({ limit: 20, used: 20 }), 'reached')
  assert.equal(quotaLevel({ limit: 20, used: 25 }), 'reached')
  assert.equal(quotaLevel({ limit: null, used: 999 }), 'ok')
  assert.equal(quotaLevel({ limit: 120, used: 96 }), 'near')
  assert.equal(quotaLevel({ limit: 0, used: 0 }), 'reached')
})

test('mode du plafond : gratuit en lives, Creator ou reglage admin en clips, test et illimite sans plafond', () => {
  assert.equal(quotaMode({ twitchId: '1', setting: undefined }), 'lives')
  assert.equal(quotaMode({ twitchId: '1', setting: DEFAULT_MONTHLY_CLIPS }), 'lives') // reglage par defaut : gratuit
  assert.equal(quotaMode({ twitchId: '1', setting: 60 }), 'clips') // l'admin a regle un nombre de clips a la main
  assert.equal(quotaMode({ twitchId: '1', setting: 0 }), 'clips') // l'admin a coupe la chaine
  assert.equal(quotaMode({ twitchId: '1', setting: DEFAULT_MONTHLY_CLIPS, planClips: 120 }), 'clips') // Creator : en clips
  assert.equal(quotaMode({ twitchId: '1', setting: null }), 'unlimited')
  assert.equal(quotaMode({ twitchId: 'test-x', setting: 5 }), 'unlimited')
  assert.equal(quotaMode({ twitchId: 'demo-clippeak', setting: undefined }), 'unlimited')
})

test('lives gratuits : 2 par mois, +1 par parrainage active, jamais negatif', () => {
  assert.equal(liveLimit(), 2)
  assert.equal(liveLimit(0), 2)
  assert.equal(liveLimit(1), 3)
  assert.equal(liveLimit(5), 7)
  assert.equal(liveLimit(-3), 2)
  assert.equal(liveRoom(2, 0), 2)
  assert.equal(liveRoom(2, 2), 0)
  assert.equal(liveRoom(2, 5), 0)
})

test('vue du plafond en lives : unite, lives restants, clips du mois gardes pour l affichage', () => {
  const now = new Date('2026-11-16T10:00:00Z')
  assert.deepEqual(liveQuotaView(2, 1, 9, now), { limit: 2, used: 1, remaining: 1, reached: false, resetsAt: '2026-12-01T00:00:00.000Z', bonus: 0, unit: 'lives', clipsUsed: 9 })
  assert.equal(liveQuotaView(2, 2, 14, now).reached, true)
  assert.equal(quotaView(20, 3, now).unit, 'clips')
})
