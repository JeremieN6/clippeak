import test from 'node:test'
import assert from 'node:assert/strict'
import { pickWelcomeVods, registerWelcomeVods, WELCOME_MAX_VODS } from './welcomeVods.ts'

const NOW = new Date('2026-11-20T12:00:00Z')
const HOUR = 3600
const video = (id: string, createdAt: string, durationSec: number, streamId: string | null = `s${id}`) =>
  ({ id, streamId, url: `https://twitch.tv/videos/${id}`, title: `Live ${id}`, createdAt: new Date(createdAt), durationSec })

function deps(archives: any[], options: { vods?: number, live?: { id: string, startedAt: Date } } = {}) {
  const upserts: any[] = []
  return {
    upserts,
    deps: {
      api: {
        listArchives: async () => archives,
        getLiveStreams: async () => new Map(options.live ? [['42', { id: options.live.id, userId: '42', startedAt: options.live.startedAt }]] : [])
      },
      store: { countVods: async () => options.vods ?? 0, upsertVod: async (v: any) => { upserts.push(v) } },
      now: () => NOW
    }
  }
}

test('reprend les deux derniers lives, le plus recent d\'abord', () => {
  const picked = pickWelcomeVods([video('1', '2026-11-18T20:00:00Z', 3 * HOUR), video('3', '2026-11-19T20:00:00Z', 2 * HOUR), video('2', '2026-11-17T20:00:00Z', HOUR)], undefined, NOW)
  assert.deepEqual(picked.map(v => v.id), ['3', '1'])
  assert.equal(picked.length, WELCOME_MAX_VODS)
})

test('ecarte les lives trop courts et trop anciens', () => {
  const picked = pickWelcomeVods([video('short', '2026-11-19T20:00:00Z', 5 * 60), video('old', '2026-10-01T20:00:00Z', 4 * HOUR), video('ok', '2026-11-15T20:00:00Z', HOUR)], undefined, NOW)
  assert.deepEqual(picked.map(v => v.id), ['ok'])
})

test('le deuxieme live n\'est repris que s\'il tient dans le budget d\'audio gratuit (10 h)', () => {
  const picked = pickWelcomeVods([video('a', '2026-11-19T20:00:00Z', 8 * HOUR), video('b', '2026-11-18T20:00:00Z', 5 * HOUR), video('c', '2026-11-17T20:00:00Z', 2 * HOUR)], undefined, NOW)
  assert.deepEqual(picked.map(v => v.id), ['a', 'c'])
})

test('un premier live plus long que le budget est quand meme repris (on ne laisse pas le streamer sans rien)', () => {
  const picked = pickWelcomeVods([video('big', '2026-11-19T20:00:00Z', 12 * HOUR)], undefined, NOW)
  assert.deepEqual(picked.map(v => v.id), ['big'])
})

test('enregistre les VODs terminees avec leur fin calculee, en source auto', async () => {
  const { deps: d, upserts } = deps([video('1', '2026-11-19T20:00:00Z', 2 * HOUR)])
  assert.equal(await registerWelcomeVods({ id: 'c1', twitchId: '42' }, d), 1)
  assert.equal(upserts[0].status, 'ended')
  assert.equal(upserts[0].source, 'auto')
  assert.equal(upserts[0].endedAt.toISOString(), '2026-11-19T22:00:00.000Z')
})

test('le live en cours est enregistre « live » avec l\'heure reelle de debut', async () => {
  const startedAt = new Date('2026-11-20T10:00:00Z')
  const { deps: d, upserts } = deps([video('now', '2026-11-20T10:00:05Z', 0, 'S1'), video('before', '2026-11-19T20:00:00Z', HOUR)], { live: { id: 'S1', startedAt } })
  assert.equal(await registerWelcomeVods({ id: 'c1', twitchId: '42' }, d), 2)
  const current = upserts.find(u => u.twitchVodId === 'now')
  assert.equal(current.status, 'live')
  assert.equal(current.endedAt, null)
  assert.equal(current.startedAt, startedAt)
})

test('ne fait rien si la chaine a deja des VODs (aucun doublon, aucune reprise tardive)', async () => {
  const { deps: d, upserts } = deps([video('1', '2026-11-19T20:00:00Z', HOUR)], { vods: 3 })
  assert.equal(await registerWelcomeVods({ id: 'c1', twitchId: '42' }, d), 0)
  assert.equal(upserts.length, 0)
})

test('aucun live recent : rien n\'est enregistre', async () => {
  const { deps: d, upserts } = deps([])
  assert.equal(await registerWelcomeVods({ id: 'c1', twitchId: '42' }, d), 0)
  assert.equal(upserts.length, 0)
})
