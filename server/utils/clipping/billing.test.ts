import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_INVOICE_FOOTER, invoiceFooter, applySubscriptionEvent, clampPacks, CREATOR_PRICE, isPayingStatus, MAX_PACKS, normalizeInterval, packsClips, periodEnd, PLAN_CLIPS, planFor, signStripePayload, subscriptionShape, verifyStripeSignature, yearlySaving } from './billing.ts'

test('plans : gratuit 20, Creator 120 ; etats payants et grace', () => {
  assert.deepEqual(PLAN_CLIPS, { free: 20, creator: 120 })
  for (const s of ['active', 'trialing', 'past_due']) assert.equal(planFor(s), 'creator', s)
  for (const s of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', null, undefined]) assert.equal(planFor(s as any), 'free', String(s))
  assert.equal(isPayingStatus('active'), true)
})

test('periodEnd : sur l abonnement ou sur son premier element', () => {
  assert.equal(periodEnd({ current_period_end: 1800000000 })?.toISOString(), new Date(1800000000 * 1000).toISOString())
  assert.equal(periodEnd({ items: { data: [{ current_period_end: 1800000000 }] } })?.getTime(), 1800000000 * 1000)
  assert.equal(periodEnd({}), null)
  assert.equal(periodEnd({ current_period_end: 'x' }), null)
})

test('signature du webhook : valide, falsifiee, corps modifie, trop ancienne, mauvais secret, en-tete absent', () => {
  const secret = 'whsec_test_secret'; const body = '{"id":"evt_1","type":"x"}'; const now = 1_800_000_000_000
  const header = signStripePayload(body, secret, now)
  assert.equal(verifyStripeSignature(body, header, secret, now), true)
  assert.equal(verifyStripeSignature(body + ' ', header, secret, now), false)
  assert.equal(verifyStripeSignature(body, header.slice(0, -2) + '00', secret, now), false)
  assert.equal(verifyStripeSignature(body, header, 'whsec_autre', now), false)
  assert.equal(verifyStripeSignature(body, header, secret, now + 6 * 60 * 1000), false)
  assert.equal(verifyStripeSignature(body, header, secret, now + 4 * 60 * 1000), true)
  assert.equal(verifyStripeSignature(body, undefined, secret, now), false)
  assert.equal(verifyStripeSignature(body, header, '', now), false)
  assert.equal(verifyStripeSignature(body, 't=abc,v1=zz', secret, now), false)
  // plusieurs v1 (rotation du secret) : l'une des deux suffit
  assert.equal(verifyStripeSignature(body, `${header},v1=deadbeef`, secret, now), true)
})

test('evenements d abonnement : cree/mis a jour selon le statut, supprime = gratuit, autres ignores', () => {
  assert.deepEqual(applySubscriptionEvent('customer.subscription.created', { status: 'active', current_period_end: 1800000000 }), { plan: 'creator', status: 'active', periodEnd: new Date(1800000000 * 1000), packs: 1, interval: null })
  assert.equal(applySubscriptionEvent('customer.subscription.updated', { status: 'past_due' })?.plan, 'creator')
  assert.equal(applySubscriptionEvent('customer.subscription.updated', { status: 'unpaid' })?.plan, 'free')
  assert.deepEqual(applySubscriptionEvent('customer.subscription.deleted', { status: 'canceled' }), { plan: 'free', status: 'canceled', periodEnd: null, packs: 1, interval: null })
  assert.equal(applySubscriptionEvent('invoice.paid', { status: 'active' }), null)
})

test('packs : de 1 a 5, 120 clips chacun ; valeurs absurdes ramenees dans les limites', () => {
  assert.equal(MAX_PACKS, 5)
  assert.deepEqual([1, 2, 5].map(packsClips), [120, 240, 600])
  for (const [raw, expected] of [[0, 1], [-3, 1], [7, 5], [2.9, 2], ['3', 3], ['x', 1], [null, 1], [undefined, 1], [NaN, 1]] as const) assert.equal(clampPacks(raw), expected, String(raw))
})

test('abonnement : packs (quantite) et rythme lus sur le premier element, y compris apres un changement dans le portail', () => {
  const sub = (quantity: number, interval: string) => ({ status: 'active', items: { data: [{ quantity, price: { recurring: { interval } } }] } })
  assert.deepEqual(subscriptionShape(sub(3, 'year')), { packs: 3, interval: 'year' })
  assert.deepEqual(subscriptionShape(sub(1, 'month')), { packs: 1, interval: 'month' })
  assert.deepEqual(subscriptionShape({ items: { data: [{ quantity: 99, plan: { interval: 'year' } }] } }), { packs: 5, interval: 'year' })
  assert.deepEqual(subscriptionShape({}), { packs: 1, interval: null })
  const evt = applySubscriptionEvent('customer.subscription.updated', sub(2, 'year'))
  assert.equal(evt?.packs, 2)
  assert.equal(evt?.interval, 'year')
  assert.equal(normalizeInterval('week'), null)
})

test('annuel : 19 x 12 = 228 > 144 ; l economie affichee est exacte', () => {
  assert.deepEqual(CREATOR_PRICE, { monthly: 19, yearly: 144 })
  const s = yearlySaving(CREATOR_PRICE.monthly, CREATOR_PRICE.yearly)
  assert.deepEqual(s, { fullYear: 228, saved: 84, percent: 37, perMonth: 12 })
  assert.ok(CREATOR_PRICE.monthly * 12 > CREATOR_PRICE.yearly)
  assert.equal(yearlySaving(10, 200).saved, 0)
})

test('pied de facture : mention auto-entrepreneur par defaut, texte libre, none pour ne rien imprimer', () => {
  assert.equal(invoiceFooter(undefined), DEFAULT_INVOICE_FOOTER)
  assert.equal(invoiceFooter(''), 'TVA non applicable, art. 293 B du CGI')
  assert.equal(invoiceFooter('  Mon texte  '), 'Mon texte')
  assert.equal(invoiceFooter('none'), null)
  assert.equal(invoiceFooter('NONE'), null)
  assert.equal(invoiceFooter('x'.repeat(900))?.length, 500)
})
