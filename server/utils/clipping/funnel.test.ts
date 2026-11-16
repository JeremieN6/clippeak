import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeFunnel, median, quotaReachedAt, weekStart } from './funnel.ts'

const d = (s: string) => new Date(s)
const NOW = d('2026-11-18T12:00:00Z')

test('mediane et debut de semaine (lundi UTC)', () => {
  assert.equal(median([]), null)
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([1, 2, 3, 4]), 2.5)
  assert.equal(weekStart(d('2026-11-15T10:00:00Z')).toISOString(), '2026-11-09T00:00:00.000Z') // dimanche
  assert.equal(weekStart(d('2026-11-16T00:00:00Z')).toISOString(), '2026-11-16T00:00:00.000Z') // lundi
})

test('limite atteinte : le clip qui remplit le quota, premier mois concerne', () => {
  const jobs = ['2026-10-02', '2026-10-03', '2026-10-04', '2026-11-01', '2026-11-02'].map(d)
  assert.equal(quotaReachedAt(jobs, 3)?.toISOString(), '2026-10-04T00:00:00.000Z')
  assert.equal(quotaReachedAt(jobs, 4), null)
  assert.equal(quotaReachedAt(jobs, null), null)
  assert.equal(quotaReachedAt(jobs, 0), null)
})

test('entonnoir : comptes, taux depuis l’etape de reference, delais medians', () => {
  const r = computeFunnel({
    requests: [d('2026-11-01T00:00:00Z'), d('2026-11-02T00:00:00Z'), d('2026-11-03T00:00:00Z'), d('2026-11-04T00:00:00Z')],
    invites: [
      { createdAt: d('2026-11-02T00:00:00Z'), twitchId: 'a' },
      { createdAt: d('2026-11-02T00:00:00Z'), twitchId: 'b' }
    ],
    channels: [
      { twitchId: 'a', connectedAt: d('2026-11-04T00:00:00Z'), onboardingAt: d('2026-11-04T12:00:00Z'), batchAt: d('2026-11-05T00:00:00Z'), validatedAt: d('2026-11-06T00:00:00Z'), quotaAt: d('2026-11-10T00:00:00Z'), paidAt: d('2026-11-11T00:00:00Z') },
      { twitchId: 'b', connectedAt: d('2026-11-08T00:00:00Z'), onboardingAt: d('2026-11-08T06:00:00Z') }
    ]
  }, NOW)
  const by = Object.fromEntries(r.steps.map(s => [s.id, s]))
  assert.deepEqual(r.steps.map(s => s.count), [4, 2, 2, 2, 1, 1, 1, 1])
  assert.equal(by.requests.rateFromParent, null)
  assert.equal(by.invites.rateFromParent, null) // une demande disparait a l'invitation : pas de taux
  assert.equal(by.connected.rateFromParent, 100) // invitations utilisees / envoyees
  assert.equal(by.batch.rateFromParent, 50)
  assert.equal(by.quota.rateFromParent, 100) // part des clips valides, pas de l'etape precedente de la liste
  assert.equal(by.paid.rateFromParent, 100)
  assert.equal(by.connected.medianDays, 4) // invites a le 2, a connecte le 4 (2 j) ; b le 2 -> 8 (6 j) : mediane 4
  assert.equal(by.onboarding.medianDays, 0.4) // 12 h et 6 h : mediane 9 h = 0,375 j
  assert.equal(by.validated.medianDays, 1)
  assert.equal(by.requests.medianDays, null)
})

test('un parcours incomplet n’est pas compte plus loin : jamais plus de 100 %', () => {
  const r = computeFunnel({
    requests: [], invites: [],
    channels: [{ twitchId: 'x', connectedAt: d('2026-11-01T00:00:00Z'), validatedAt: d('2026-11-02T00:00:00Z'), paidAt: d('2026-11-03T00:00:00Z') }]
  }, NOW)
  assert.deepEqual(r.steps.map(s => s.count), [0, 0, 1, 0, 0, 0, 0, 0])
  assert.ok(r.steps.every(s => s.rateFromParent === null || s.rateFromParent <= 100))
})

test('courbe par semaine : 12 semaines, la semaine en cours en dernier', () => {
  const r = computeFunnel({ requests: [d('2026-11-17T10:00:00Z'), d('2026-11-09T10:00:00Z'), d('2026-11-08T10:00:00Z')], invites: [], channels: [] }, NOW)
  assert.equal(r.weeks.length, 12)
  assert.equal(r.weeks.at(-1)!.weekStart, '2026-11-16')
  assert.equal(r.weeks.at(-1)!.counts.requests, 1)
  assert.equal(r.weeks.at(-2)!.counts.requests, 1)
  assert.equal(r.weeks.at(-3)!.counts.requests, 1)
})

test('aucune donnee personnelle dans la sortie', () => {
  const r = computeFunnel({ requests: [], invites: [{ createdAt: d('2026-11-02T00:00:00Z'), twitchId: 'secret-id' }], channels: [{ twitchId: 'secret-id', connectedAt: d('2026-11-03T00:00:00Z') }] }, NOW)
  assert.ok(!JSON.stringify(r).includes('secret-id'))
})
