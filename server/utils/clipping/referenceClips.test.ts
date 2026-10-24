import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReferenceProfile, rateAgainstReference, toReferenceClips } from './referenceClips.ts'
import { createTwitchApi } from './twitchApi.ts'

const clips = [
  { id: 'a', title: 'Il retrouve son pere en direct', viewCount: 9000, durationSec: 30, category: 'Just Chatting' },
  { id: 'b', title: 'Son pere arrive, quelle histoire', viewCount: 6000, durationSec: 28, category: 'Just Chatting' },
  { id: 'c', title: 'Ce boss est impossible', viewCount: 1000, durationSec: 20, category: 'Elden Ring' },
  { id: 'd', title: 'Mort ridicule sur le boss', viewCount: 500, durationSec: 22, category: 'Elden Ring' }
]

test('buildReferenceProfile ranks topics by views and categories by average views', () => {
  const profile = buildReferenceProfile(clips)
  assert.equal(profile.clipCount, 4)
  assert.equal(profile.medianViews, 3500)
  assert.equal(profile.topics[0].word, 'pere')
  assert.ok(profile.topics.some(t => t.word === 'boss'))
  assert.equal(profile.topics.some(t => t.word === 'dans'), false)
  assert.deepEqual(profile.categories.map(c => c.name), ['Just Chatting', 'Elden Ring'])
  assert.equal(profile.categories[0].avgViews, 7500)
})

test('rateAgainstReference boosts matching topics and weights by category performance', () => {
  const profile = buildReferenceProfile(clips)
  const strong = rateAgainstReference(6, 'Just Chatting', "mon pere m'a rappele hier", profile)
  const weak = rateAgainstReference(6, 'Elden Ring', 'rien de special ici', profile)
  assert.ok(strong.adjustedScore > weak.adjustedScore)
  assert.deepEqual(strong.matchedTopics, ['pere'])
  assert.ok(strong.categoryRatio > 1 && weak.categoryRatio < 1)
  assert.ok(strong.adjustedScore <= 10)
  // categorie inconnue ou banque vide : pas d'ajustement arbitraire
  assert.equal(rateAgainstReference(6, 'Inconnue', 'xxxx', profile).categoryRatio, 1)
  assert.deepEqual(rateAgainstReference(6, 'x', 'pere', buildReferenceProfile([])), { adjustedScore: 6, categoryRatio: 1, matchedTopics: [] })
})

test('listClips and getGameNames read Helix and map to reference clips', async () => {
  const urls: string[] = []
  const fetchFn = (async (url: string) => {
    if (url.includes('oauth2/token')) return { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 3600 }) }
    urls.push(url)
    if (url.includes('/clips')) {
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'c1', url: 'u', title: 'Titre', view_count: 120, duration: 25.5, game_id: '33214', created_at: '2026-10-01T10:00:00Z', creator_name: 'x' }, { id: 'c2', url: 'u2', title: 'Sans jeu', view_count: 5, duration: 10, game_id: '', created_at: '2026-10-02T10:00:00Z', creator_name: 'y' }] }) }
    }
    return { ok: true, status: 200, json: async () => ({ data: [{ id: '33214', name: 'Fortnite' }] }) }
  }) as unknown as typeof fetch
  const api = createTwitchApi({ clientId: 'a', clientSecret: 'b' }, fetchFn)
  const list = await api.listClips('42', 500)
  assert.ok(urls[0].includes('first=100'))
  const names = await api.getGameNames(list.map(c => c.gameId ?? ''))
  const reference = toReferenceClips(list, names)
  assert.deepEqual(reference.map(r => r.category), ['Fortnite', 'general'])
  assert.equal(reference[0].viewCount, 120)
})
