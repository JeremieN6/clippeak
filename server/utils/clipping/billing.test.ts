import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_INVOICE_FOOTER, invoiceFooter, applySubscriptionEvent, isPayingStatus, periodEnd, PLAN_CLIPS, planFor, signStripePayload, verifyStripeSignature } from './billing.ts'

test('plans : gratuit 40, Creator 120 ; etats payants et grace', () => {
  assert.deepEqual(PLAN_CLIPS, { free: 40, creator: 120 })
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
  assert.deepEqual(applySubscriptionEvent('customer.subscription.created', { status: 'active', current_period_end: 1800000000 }), { plan: 'creator', status: 'active', periodEnd: new Date(1800000000 * 1000) })
  assert.equal(applySubscriptionEvent('customer.subscription.updated', { status: 'past_due' })?.plan, 'creator')
  assert.equal(applySubscriptionEvent('customer.subscription.updated', { status: 'unpaid' })?.plan, 'free')
  assert.deepEqual(applySubscriptionEvent('customer.subscription.deleted', { status: 'canceled' }), { plan: 'free', status: 'canceled', periodEnd: null })
  assert.equal(applySubscriptionEvent('invoice.paid', { status: 'active' }), null)
})

test('pied de facture : mention auto-entrepreneur par defaut, texte libre, none pour ne rien imprimer', () => {
  assert.equal(invoiceFooter(undefined), DEFAULT_INVOICE_FOOTER)
  assert.equal(invoiceFooter(''), 'TVA non applicable, art. 293 B du CGI')
  assert.equal(invoiceFooter('  Mon texte  '), 'Mon texte')
  assert.equal(invoiceFooter('none'), null)
  assert.equal(invoiceFooter('NONE'), null)
  assert.equal(invoiceFooter('x'.repeat(900))?.length, 500)
})
