import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStripeClient, isMissingResource, StripeError } from './stripeApi.ts'

const fake = (status: number, body: unknown) => createStripeClient({ secretKey: 'sk_test_x', apiBase: 'http://stripe.invalid', fetchFn: async () => new Response(JSON.stringify(body), { status }) })

test('un client absent chez Stripe (cree en mode test, cles de production) est reconnu, avec son code', async () => {
  const stripe = fake(400, { error: { code: 'resource_missing', message: 'No such customer: cus_test' } })
  const error = await stripe.createPortalSession({ customerId: 'cus_test', returnUrl: 'https://x.test/studio' }).catch(e => e)
  assert.ok(error instanceof StripeError)
  assert.equal(error.code, 'resource_missing')
  assert.equal(error.status, 400)
  assert.equal(isMissingResource(error), true)
  assert.ok(!error.message.includes('sk_test_x')) // jamais la cle dans un message
})

test('les autres refus de Stripe ne sont pas pris pour un objet absent', async () => {
  const error = await fake(429, { error: { code: 'rate_limit' } }).createPortalSession({ customerId: 'cus_1', returnUrl: 'https://x.test' }).catch(e => e)
  assert.equal(isMissingResource(error), false)
  assert.equal(error.code, 'rate_limit')
  assert.equal(isMissingResource(new Error('autre')), false)
  const noCode = await fake(500, 'pas du json').createPortalSession({ customerId: 'cus_1', returnUrl: 'https://x.test' }).catch(e => e)
  assert.equal(noCode.code, null)
})
