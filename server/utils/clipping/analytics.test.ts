import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEvent, buildPublicEvent, isPrivatePath, PUBLIC_EVENTS, safeProps } from './analytics.ts'

test('espaces prives : studio, admin, connexion, attente', () => {
  for (const p of ['/studio', '/studio?channel=x', '/admin', '/attente', '/connexion', '/inscription']) assert.equal(isPrivatePath(p), true, p)
  for (const p of ['/', '/try-now', '/confidentialite', '/conditions', '/studiofoo']) assert.equal(isPrivatePath(p), false, p)
})

test('safeProps garde les mots-cles, nombres et booleens, jamais une phrase ni un titre', () => {
  assert.deepEqual(safeProps({ step: 3, kind: 'done', first: true, platform: 'youtube' }), { step: 3, kind: 'done', first: true, platform: 'youtube' })
  assert.deepEqual(safeProps({ title: 'Il a vraiment dit ça', login: 'Jeremfut7', note: 'Ma note perso', n: 1.5, Big: 'ok' }), {})
  assert.deepEqual(safeProps({ feature: 'tiktok', text: 'une idée' }), { feature: 'tiktok' })
  assert.deepEqual(safeProps(), {})
})

test('buildEvent refuse un evenement hors liste', () => {
  assert.equal(buildEvent('mon_evenement', {}), null)
  assert.deepEqual(buildEvent('clip_published', { platform: 'youtube', when: 'now', first: true, caption: 'Salut tout le monde' }), { name: 'clip_published', props: { platform: 'youtube', when: 'now', first: true } })
})

import { scrubEvent } from './analytics.ts'

test('scrubEvent : /admin ne part jamais ; espaces prives sans parametres d adresse ; pages publiques inchangees', () => {
  assert.equal(scrubEvent({ event: '$pageview', properties: { $current_url: 'https://clippeak.sassify.fr/admin' } }), null)
  assert.equal(scrubEvent({ event: '$pageview', properties: { $pathname: '/admin/x', $current_url: 'https://x/admin/x?a=1' } }), null)
  const wait = scrubEvent({ event: '$pageview', properties: { $current_url: 'https://clippeak.sassify.fr/attente?login=jeremfut7', current_url: '/attente?login=jeremfut7', $referrer: 'https://x/connexion?login=error', other: 'x?y' }, $set_once: { $initial_current_url: 'https://x/studio?channel=abc' } })
  assert.equal(wait?.properties?.$current_url, 'https://clippeak.sassify.fr/attente')
  assert.equal(wait?.properties?.current_url, '/attente')
  assert.equal(wait?.properties?.$referrer, 'https://x/connexion')
  assert.equal(wait?.properties?.other, 'x?y')
  assert.equal(wait?.$set_once?.$initial_current_url, 'https://x/studio')
  const pub = { event: '$pageview', properties: { $current_url: 'https://clippeak.sassify.fr/?utm_source=x' } }
  assert.deepEqual(scrubEvent(pub), pub)
  assert.equal(scrubEvent(null), null)
})

test('evenements du site public : liste fermee, emplacement et rythme gardes, jamais de texte libre', () => {
  assert.equal(buildPublicEvent('mon_evenement'), null)
  assert.equal(buildPublicEvent('clip_published'), null) // evenement du studio : pas dans la liste publique
  assert.deepEqual(buildPublicEvent('login_clicked', { location: 'hero', login: 'Jeremfut7', note: 'Salut tout le monde' }), { name: 'login_clicked', props: { location: 'hero' } })
  assert.deepEqual(buildPublicEvent('pricing_interval_changed', { interval: 'year' }), { name: 'pricing_interval_changed', props: { interval: 'year' } })
  assert.deepEqual(buildPublicEvent('pricing_packs_changed', { packs: 3 }), { name: 'pricing_packs_changed', props: { packs: 3 } })
  for (const name of PUBLIC_EVENTS) assert.ok(buildPublicEvent(name))
})
