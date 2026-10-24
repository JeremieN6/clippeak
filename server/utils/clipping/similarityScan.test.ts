import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCorpus } from './referenceSimilarity.ts'
import { findSimilarWindows, nextSlice, windowToCandidate } from './similarityScan.ts'

const corpus = buildCorpus([
  { id: 'marche', text: "Alors hier je suis allee au marche et le vendeur m'a dit que ma mere achetait que des legumes en promotion, j'ai explose de rire devant tout le monde" },
  { id: 'jeu', text: "Le boss final de ce jeu est impossible, je suis mort dix fois de suite sur la meme attaque, c'est une honte" }
])

const seg = (start: number, end: number, text: string) => ({ start, end, text })
const filler = (from: number, count: number) => Array.from({ length: count }, (_, i) => seg(from + i * 8, from + i * 8 + 7, 'bon on continue la partie tranquillement avec le chat et voila'))

const stream = [
  ...filler(0, 5),
  seg(40, 50, "hier je suis allee au marche avec ma mere et le vendeur m'a dit que les legumes"),
  seg(50, 60, "etaient en promotion alors j'ai explose de rire devant tout le monde au marche"),
  ...filler(100, 20),
  seg(300, 312, 'le boss de ce jeu est impossible je suis mort dix fois sur la meme attaque'),
  seg(312, 324, "franchement c'est une honte ce jeu et ce boss final est vraiment impossible")
]

test('findSimilarWindows finds the passages close to reference clips and ignores filler talk', () => {
  const found = findSimilarWindows(stream, corpus)
  assert.deepEqual(found.map(w => w.matchId), ['marche', 'jeu'])
  assert.ok(found[0].startSec >= 15 && found[0].endSec === 60)
  assert.ok(found.every(w => w.similarity >= 0.2 && w.sharedTerms.length > 0))
  assert.deepEqual(findSimilarWindows(filler(0, 30), corpus), [])
  assert.deepEqual(findSimilarWindows(stream, buildCorpus([])), [])
})

test('findSimilarWindows respects exclusions, the gap between moments and the maximum', () => {
  assert.deepEqual(findSimilarWindows(stream, corpus, { exclude: [60] }).map(w => w.matchId), ['jeu'])
  assert.equal(findSimilarWindows(stream, corpus, { max: 1 }).length, 1)
  assert.equal(findSimilarWindows(stream, corpus, { minGapSec: 1000 }).length, 1)
  assert.deepEqual(findSimilarWindows(stream, corpus, { minSimilarity: 0.99 }), [])
})

test('windowToCandidate gives the pipeline a chat-less peak at the end of the passage with the following sentences', () => {
  const window = findSimilarWindows(stream, corpus)[0]
  const { peak, transcript } = windowToCandidate(window, stream)
  assert.equal(peak.peakSec, window.endSec)
  assert.ok(peak.score > 0 && peak.score <= 10)
  assert.equal(peak.signals.messages, 0)
  assert.equal(transcript.beforePeak, window.text)
  assert.ok(transcript.segments.length >= 2)
  assert.ok(transcript.windowDurationSec > 0)
})

test('nextSlice waits for a whole slice during the live, finishes with a short one on a finished VOD, and looks back at the joint', () => {
  assert.equal(nextSlice({ scanSec: 0, limitSec: 250, final: false }), null)
  assert.deepEqual(nextSlice({ scanSec: 0, limitSec: 700, final: false }), { startSec: 0, durationSec: 300, newFromSec: 0 })
  assert.deepEqual(nextSlice({ scanSec: 300, limitSec: 700, final: false }), { startSec: 270, durationSec: 330, newFromSec: 300 })
  assert.deepEqual(nextSlice({ scanSec: 600, limitSec: 700, final: true }), { startSec: 570, durationSec: 130, newFromSec: 600 })
  assert.equal(nextSlice({ scanSec: 695, limitSec: 700, final: true }), null)
})
