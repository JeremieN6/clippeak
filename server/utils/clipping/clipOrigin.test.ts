import test from 'node:test'
import assert from 'node:assert/strict'
import { clipOrigin } from './clipOrigin.ts'
import { parseStyle } from './streamerStyle.ts'

test('a moment found by similarity alone is flagged as coming from the references, anything else as chat', () => {
  assert.equal(clipOrigin('detecte par ressemblance avec les clips de reference (pas par le chat) : passage proche'), 'ref')
  assert.equal(clipOrigin('  Detecte par ressemblance ...'), 'ref')
  assert.equal(clipOrigin('Le chat explose et le moment ressemble a un clip de reference'), 'chat')
  assert.equal(clipOrigin(null), 'chat')
})

test('onboarding progress defaults to empty and rejects unknown platforms or steps', () => {
  const style = parseStyle({})
  assert.deepEqual(style.onboarding, { done: [], skipped: [], completed: false, platforms: [] })
  assert.deepEqual(parseStyle({ onboarding: { done: [1, 2], platforms: ['tiktok'] } }).onboarding.platforms, ['tiktok'])
  assert.throws(() => parseStyle({ onboarding: { platforms: ['myspace'] } }))
  assert.throws(() => parseStyle({ onboarding: { done: [9] } }))
})
