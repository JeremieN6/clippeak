import test from 'node:test'
import assert from 'node:assert/strict'
import { commandsProblem, detectMarkers, markerWhy, normalizeCommand } from './longMarkers.ts'
import { parseCommentsResponse } from './twitchChat.ts'
import { scanMarkers } from './markerScan.ts'
import type { MarkerStore, MarkerTarget, NewProposal } from './markerScan.ts'
import type { ChatMessage } from './chatPeaks.ts'
import type { MarkerOptions } from './longMarkers.ts'

const base: MarkerOptions = { startCommand: '!extrait', endCommand: '!fin', channelLogin: 'jeremfut7', channelTwitchId: '123', allowModerators: false, maxSec: 600, final: true }
const streamer = (t: number, text: string): ChatMessage => ({ t, text, author: 'JeremFut7', badges: ['broadcaster'] })

test('normalizeCommand and commandsProblem: a command is « ! » plus 2 to 20 letters or digits, and the two differ', () => {
  assert.equal(normalizeCommand(' !Extrait '), '!extrait')
  assert.equal(normalizeCommand('!a'), null)
  assert.equal(normalizeCommand('extrait'), null)
  assert.equal(normalizeCommand('!ex trait'), null)
  assert.equal(normalizeCommand('!' + 'a'.repeat(21)), null)
  assert.equal(commandsProblem('!debut', '!fin'), null)
  assert.match(commandsProblem('debut', '!fin')!, /début/)
  assert.match(commandsProblem('!debut', 'fin')!, /fin/)
  assert.match(commandsProblem('!x1', '!X1')!, /différentes/)
})

test('detectMarkers: a start and its end make one passage, in the order of the live', () => {
  const [p] = detectMarkers([streamer(5452, '!fin'), streamer(4990, '!extrait')], base)
  assert.deepEqual([p.startSec, p.endSec, p.startMarkSec, p.endMarkSec, p.capped, p.inferredEnd], [4990, 5452, 4990, 5452, false, false])
})

test('detectMarkers: only the streamer (and moderators when allowed) are heard, viewers are ignored', () => {
  const viewer: ChatMessage[] = [{ t: 100, text: '!extrait', author: 'spectateur', badges: [] }, { t: 400, text: '!fin', author: 'spectateur', badges: [] }]
  assert.equal(detectMarkers(viewer, base).length, 0)
  const mod: ChatMessage[] = [{ t: 100, text: '!extrait', author: 'modo', badges: ['moderator'] }, { t: 400, text: '!fin', author: 'modo', badges: ['moderator'] }]
  assert.equal(detectMarkers(mod, base).length, 0)
  assert.equal(detectMarkers(mod, { ...base, allowModerators: true }).length, 1)
  // Le pseudo de connexion suffit (majuscules ignorees) ; un message sans auteur connu est refuse.
  assert.equal(detectMarkers([{ t: 100, text: '!extrait', author: 'JEREMFUT7' }, { t: 400, text: '!fin', author: 'jeremfut7' }], base).length, 1)
  // Un badge « broadcaster » ne suffit pas (chat partage : le proprietaire d'une autre chaine en porte un) ; il faut le bon pseudo.
  const guest: ChatMessage[] = [{ t: 100, text: '!extrait', author: 'autre_streamer', badges: ['broadcaster'] }, { t: 400, text: '!fin', author: 'autre_streamer', badges: ['broadcaster'] }]
  assert.equal(detectMarkers(guest, base).length, 0)
  assert.equal(detectMarkers(guest, { ...base, allowModerators: true }).length, 0)
  // Un seul des deux messages venant du streamer ne forme pas un passage avec un spectateur.
  assert.equal(detectMarkers([streamer(100, '!extrait'), { t: 400, text: '!fin', author: 'spectateur' }], { ...base, final: false }).length, 0)
  assert.equal(detectMarkers([{ t: 100, text: '!extrait' }, { t: 400, text: '!fin' }], base).length, 0)
})

test('detectMarkers: the Twitch id wins (a renamed streamer still works, another account with the old name does not), the badge only confirms', () => {
  const pair = (patch: Partial<ChatMessage>): ChatMessage[] => [{ t: 100, text: '!extrait', ...patch }, { t: 400, text: '!fin', ...patch }]
  // Pseudo change depuis la connexion : le bon identifiant suffit, meme sans badge.
  assert.equal(detectMarkers(pair({ author: 'nouveau_pseudo', authorId: '123' }), base).length, 1)
  // Un autre compte qui reprend l'ancien pseudo : identifiant different, refuse, meme avec le badge.
  assert.equal(detectMarkers(pair({ author: 'jeremfut7', authorId: '999', badges: ['broadcaster'] }), base).length, 0)
  // Le bon pseudo ET le badge : accepte. Le bon pseudo avec des badges connus mais sans « broadcaster » : refuse.
  assert.equal(detectMarkers(pair({ author: 'jeremfut7', badges: ['broadcaster', 'subscriber'] }), base).length, 1)
  assert.equal(detectMarkers(pair({ author: 'jeremfut7', badges: ['subscriber'] }), base).length, 0)
  // Badges inconnus (liste vide ou absente) : le bon pseudo suffit.
  assert.equal(detectMarkers(pair({ author: 'jeremfut7', badges: [] }), base).length, 1)
  // Le badge sans le bon compte ne donne rien, avec ou sans identifiant.
  assert.equal(detectMarkers(pair({ author: 'autre', authorId: '999', badges: ['broadcaster'] }), base).length, 0)
  assert.equal(detectMarkers(pair({ author: 'autre', badges: ['broadcaster'] }), base).length, 0)
  // Moderateur : seulement si le streamer l'a choisi.
  assert.equal(detectMarkers(pair({ author: 'modo', authorId: '555', badges: ['moderator'] }), base).length, 0)
  assert.equal(detectMarkers(pair({ author: 'modo', authorId: '555', badges: ['moderator'] }), { ...base, allowModerators: true }).length, 1)
})

test('detectMarkers: the command must be the first word, case does not matter, custom commands work', () => {
  assert.equal(detectMarkers([streamer(100, '!EXTRAIT le début'), streamer(400, '!fin merci')], base).length, 1)
  assert.equal(detectMarkers([streamer(100, 'je tape !extrait'), streamer(400, '!fin')], base).length, 0)
  assert.equal(detectMarkers([streamer(100, '!extraits'), streamer(400, '!fin')], base).length, 0)
  assert.equal(detectMarkers([streamer(100, '!top'), streamer(400, '!stop')], { ...base, startCommand: '!top', endCommand: '!stop' }).length, 1)
})

test('detectMarkers: an end alone is ignored, a restart replaces an unfinished start, a passage under 3 minutes is ignored', () => {
  assert.equal(detectMarkers([streamer(400, '!fin')], base).length, 0)
  const restarted = detectMarkers([streamer(100, '!extrait'), streamer(500, '!extrait'), streamer(900, '!fin')], base)
  assert.deepEqual(restarted.map(p => [p.startSec, p.endSec]), [[500, 900]])
  assert.equal(detectMarkers([streamer(100, '!extrait'), streamer(200, '!fin')], base).length, 0)
  // Deux passages a la suite.
  const two = detectMarkers([streamer(100, '!extrait'), streamer(400, '!fin'), streamer(1000, '!extrait'), streamer(1400, '!fin')], base)
  assert.equal(two.length, 2)
})

test('detectMarkers: too long is shortened to the maximum, an unfinished start waits for the end of the live then gets 5 minutes', () => {
  const [long] = detectMarkers([streamer(100, '!extrait'), streamer(2000, '!fin')], base)
  assert.deepEqual([long.startSec, long.endSec, long.capped], [100, 700, true])
  assert.match(markerWhy(long, base), /raccourci/)
  assert.equal(detectMarkers([streamer(100, '!extrait')], { ...base, final: false }).length, 0)
  const [open] = detectMarkers([streamer(100, '!extrait')], base)
  assert.deepEqual([open.startSec, open.endSec, open.inferredEnd], [100, 400, true])
  assert.match(markerWhy(open, base), /sans !fin/)
  // Duree maximale plus courte que 5 minutes, et passage qui depasse la fin du live.
  assert.equal(detectMarkers([streamer(100, '!extrait')], { ...base, maxSec: 240 })[0].endSec, 340)
  assert.equal(detectMarkers([streamer(100, '!extrait')], { ...base, vodDurationSec: 200 }).length, 0)
  assert.equal(detectMarkers([streamer(100, '!extrait')], { ...base, vodDurationSec: 320 })[0].endSec, 320)
})

test('parseCommentsResponse keeps the author and the badges when Twitch gives them, and adds nothing otherwise', () => {
  const payload = [{ data: { video: { comments: { pageInfo: { hasNextPage: false }, edges: [
    { node: { id: '1', contentOffsetSeconds: 10, commenter: { id: '123', login: 'jeremfut7' }, message: { fragments: [{ text: '!extrait' }], userBadges: [{ setID: 'broadcaster' }, { setID: 'subscriber' }] } } },
    { node: { id: '2', contentOffsetSeconds: 11, message: { fragments: [{ text: 'mdr' }] } } }
  ] } } } }]
  const { messages } = parseCommentsResponse(payload)
  assert.deepEqual(messages[0], { t: 10, text: '!extrait', author: 'jeremfut7', authorId: '123', badges: ['broadcaster', 'subscriber'] })
  assert.deepEqual(messages[1], { t: 11, text: 'mdr' })
})

function memory(existing: number[] = []) {
  const created: NewProposal[] = []
  const progress: Array<[number, boolean]> = []
  const store: MarkerStore = {
    targets: async () => [],
    existingStarts: async () => existing,
    createProposals: async (_t, items) => { created.push(...items) },
    saveProgress: async (_id, sec, done) => { progress.push([sec, done]) }
  }
  return { store, created, progress }
}
const target = (patch: Partial<MarkerTarget> = {}): MarkerTarget => ({
  id: 'v1', channelId: 'c1', twitchVodId: '999', vodTitle: 'Live du soir', channelLogin: 'jeremfut7', channelTwitchId: '123', live: false,
  startedAt: new Date('2026-11-12T18:00:00Z'), endedAt: new Date('2026-11-12T22:00:00Z'), markerScanSec: null,
  settings: { startCommand: '!extrait', endCommand: '!fin', allowModerators: false, maxSec: 600 }, ...patch
})

test('scanMarkers creates proposals once, never again for a start already known (even ignored), and finishes an ended live', async () => {
  const chat = [streamer(4990, '!extrait'), streamer(5452, '!fin'), { t: 5500, text: 'mdr', author: 'x' }]
  const first = memory()
  const result = await scanMarkers(target(), { store: first.store, fetchChat: async () => chat })
  assert.equal(result.created, 1)
  assert.deepEqual(first.created[0], { title: 'Live du soir (1:23:10)', why: first.created[0].why, startSec: 4990, endSec: 5452 })
  assert.match(first.created[0].why, /!extrait à 1:23:10 et !fin à 1:30:52/)
  assert.deepEqual(first.progress, [[5500, true]])
  const again = memory([4992])
  assert.equal((await scanMarkers(target(), { store: again.store, fetchChat: async () => chat })).created, 0)
  assert.equal(again.created.length, 0)
})

test('scanMarkers on a live: reads again from before the last position, keeps the live open, waits for the end of an unfinished passage', async () => {
  const asked: number[] = []
  const live = memory()
  const result = await scanMarkers(target({ live: true, endedAt: null, markerScanSec: 3000 }), { store: live.store, fetchChat: async (_id, start) => { asked.push(start); return [streamer(2900, '!extrait'), streamer(3100, '!extrait')] } })
  assert.equal(result.created, 0)
  assert.deepEqual(asked, [3000 - 600 - 60])
  assert.deepEqual(live.progress, [[3100, false]])
  // Un debut ouvert avant la derniere lecture trouve sa fin grace au recouvrement.
  const paired = memory()
  assert.equal((await scanMarkers(target({ live: true, endedAt: null, markerScanSec: 3000 }), { store: paired.store, fetchChat: async () => [streamer(2900, '!extrait'), streamer(3200, '!fin')] })).created, 1)
  // Rien de nouveau dans le chat : la position ne recule jamais.
  const quiet = memory()
  await scanMarkers(target({ live: true, endedAt: null, markerScanSec: 3000 }), { store: quiet.store, fetchChat: async () => [] })
  assert.deepEqual(quiet.progress, [[3000, false]])
})
