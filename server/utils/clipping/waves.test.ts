import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bonusLives, isReferralCode, orderQueue, parisDayStart, referralAllowed, serverAllowsWave, waitState, waveSize, openSignupAllowed } from './waves.ts'
import type { Sample } from './capacity.ts'

const calm: Sample = { load1: 0.4, load5: 0.4, cores: 2, memTotalMb: 8000, memFreeMb: 5000, clipsQueued: 0, clipsRendering: 0, analysesQueued: 0, analysesRunning: 0, oldestWaitSec: null }
const at = (now: Date, minutesAgo: number, s: Partial<Sample> = {}) => ({ ...calm, ...s, at: new Date(now.getTime() - minutesAgo * 60_000) })

test('debut du jour a Paris : hiver (UTC+1) et ete (UTC+2)', () => {
  assert.equal(parisDayStart(new Date('2026-11-16T10:00:00Z')).toISOString(), '2026-11-15T23:00:00.000Z')
  assert.equal(parisDayStart(new Date('2026-11-15T23:30:00Z')).toISOString(), '2026-11-15T23:00:00.000Z') // deja le 16 a Paris
  assert.equal(parisDayStart(new Date('2026-07-10T12:00:00Z')).toISOString(), '2026-07-09T22:00:00.000Z')
  assert.equal(parisDayStart(new Date('2026-03-29T12:00:00Z')).toISOString(), '2026-03-28T23:00:00.000Z') // jour du changement d'heure
})

test('serveur calme : 3 mesures recentes, toutes « ok »', () => {
  const now = new Date('2026-11-16T12:00:00Z')
  assert.equal(serverAllowsWave([at(now, 1), at(now, 2), at(now, 3)], now), true)
  assert.equal(serverAllowsWave([at(now, 1), at(now, 2)], now), false) // pas assez de mesures
  assert.equal(serverAllowsWave([], now), false)
  assert.equal(serverAllowsWave([at(now, 6), at(now, 7), at(now, 8)], now), false) // plus de mesure fraiche : worker muet
  assert.equal(serverAllowsWave([at(now, 1), at(now, 2), at(now, 3, { load1: 2.5 })], now), false) // attention
  assert.equal(serverAllowsWave([at(now, 1), at(now, 2), at(now, 3, { load1: 4 })], now), false) // sature
  assert.equal(serverAllowsWave([at(now, 1), at(now, 2), at(now, 3), at(now, 60, { load1: 9 })], now), true) // vieille mesure ignoree
})

test('taille de la vague : plafond du jour, etalement, file, interrupteur', () => {
  const base = { enabled: true, dailyCap: 20, invitedToday: 0, serverOk: true, queueLength: 100 }
  assert.equal(waveSize(base), 3) // 20 / 8 arrondi au-dessus
  assert.equal(waveSize({ ...base, invitedToday: 19 }), 1)
  assert.equal(waveSize({ ...base, invitedToday: 20 }), 0)
  assert.equal(waveSize({ ...base, invitedToday: 25 }), 0)
  assert.equal(waveSize({ ...base, queueLength: 2 }), 2)
  assert.equal(waveSize({ ...base, queueLength: 0 }), 0)
  assert.equal(waveSize({ ...base, enabled: false }), 0)
  assert.equal(waveSize({ ...base, serverOk: false }), 0)
  assert.equal(waveSize({ ...base, dailyCap: 0 }), 0)
  assert.equal(waveSize({ ...base, dailyCap: 3 }), 1)
})

test('file : parraines d’abord, puis ordre d’arrivee', () => {
  const d = (n: number) => new Date(2026, 10, 16, 10, n)
  const sorted = orderQueue([{ id: 'a', createdAt: d(1), referred: false }, { id: 'b', createdAt: d(2), referred: true }, { id: 'c', createdAt: d(0), referred: false }, { id: 'd', createdAt: d(3), referred: true }])
  assert.deepEqual(sorted.map(x => x.id), ['b', 'd', 'c', 'a'])
})

test('texte de la page d’attente', () => {
  assert.equal(waitState({ enabled: false, dailyCap: 20, invitedToday: 0 }), 'manual')
  assert.equal(waitState({ enabled: true, dailyCap: 20, invitedToday: 20 }), 'day_full')
  assert.equal(waitState({ enabled: true, dailyCap: 20, invitedToday: 5 }), 'next_wave')
})

test('parrainage : faux parrainages refuses', () => {
  const ok = { channelId: 'c', channelTwitchId: '10', referrerId: 'r', referrerTwitchId: '20' }
  assert.equal(referralAllowed(ok), true)
  assert.equal(referralAllowed({ ...ok, referrerId: 'c' }), false)
  assert.equal(referralAllowed({ ...ok, referrerTwitchId: '10' }), false)
  assert.equal(referralAllowed({ ...ok, channelTwitchId: 'test-ami' }), false)
  assert.equal(referralAllowed({ ...ok, referrerTwitchId: 'demo-clippeak' }), false)
})

test('bonus du mois plafonne, code de parrainage', () => {
  assert.equal(bonusLives(3, 5), 3)
  assert.equal(bonusLives(40, 5), 5)
  assert.equal(bonusLives(40, 25), 5) // jamais plus de 5, meme si l'ancien reglage admin etait de 25
  assert.equal(bonusLives(4, 2), 2)
  assert.equal(bonusLives(-3, 5), 0)
  assert.equal(bonusLives(10, 0), 0)
  assert.equal(isReferralCode('ABCD2345'), true)
  assert.equal(isReferralCode('abcd2345'), false)
  assert.equal(isReferralCode('ABCD234O'), false) // pas de O (confusion avec 0)
  assert.equal(isReferralCode('../../etc'), false)
})

test('inscription libre : seulement sous le plafond N, serveur calme, reglage actif', () => {
  assert.equal(openSignupAllowed({ openUntil: 10, taken: 3, serverOk: true }), true)
  assert.equal(openSignupAllowed({ openUntil: 10, taken: 9, serverOk: true }), true)
  assert.equal(openSignupAllowed({ openUntil: 10, taken: 10, serverOk: true }), false) // plafond atteint : la file reprend
  assert.equal(openSignupAllowed({ openUntil: 10, taken: 12, serverOk: true }), false)
  assert.equal(openSignupAllowed({ openUntil: 10, taken: 3, serverOk: false }), false) // serveur charge ou mesures absentes
  assert.equal(openSignupAllowed({ openUntil: 0, taken: 0, serverOk: true }), false) // reglage coupe (defaut)
})

test('page d’attente : places libres prises', () => {
  assert.equal(waitState({ enabled: false, dailyCap: 20, invitedToday: 0, openFull: true }), 'open_full')
  assert.equal(waitState({ enabled: true, dailyCap: 20, invitedToday: 5, openFull: false }), 'next_wave')
})
