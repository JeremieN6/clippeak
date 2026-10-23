import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeVod } from './vodAnalysis.ts'
import { createClaudeScorer, heuristicScore, heuristicScorer } from './momentScoring.ts'
import type { MomentCandidate } from './momentScoring.ts'

const peak = (peakSec: number, score: number) => ({
  startSec: peakSec - 10, endSec: peakSec + 5, peakSec, score,
  signals: { messages: 12, rateZ: 3, keywordShare: 0.3, capsShare: 0.1 }
})
const transcript = (before: string) => ({ windowStartSec: 0, windowDurationSec: 60, segments: [{ start: 1, end: 3, text: before }], beforePeak: before, transcribeSec: 5 })
const candidate = (before: string, chat = 7): MomentCandidate => ({ peak: peak(100, chat), transcript: transcript(before) })

test('heuristic score rewards stories and opinions told before a strong chat reaction', () => {
  const story = heuristicScore(candidate("Alors hier je suis alle au marche et du coup le mec me dit franchement je pense que tout le monde se trompe, je te jure c'est vrai mdr"))
  const empty = heuristicScore(candidate('euh oui', 7))
  assert.ok(story.score > empty.score)
  assert.equal(story.kind, 'story')
  assert.ok(story.score <= 10 && story.score >= 0)
  assert.equal(story.scorer, 'heuristic')
})

test('claude scorer parses a JSON answer and clamps the note, sending the key only in the header', async () => {
  let seen: any
  const scorer = createClaudeScorer({
    apiKey: 'sk-test', model: 'm',
    fetchFn: (async (url: string, init: any) => {
      seen = { url, headers: init.headers, body: JSON.parse(init.body) }
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'Voici: {"score": 14, "kind": "story", "hook": "Hier je suis alle", "category": "humour", "summary": "s", "rationale": "r"}' }] }) }
    }) as any
  })
  const result = await scorer.score(candidate('texte'))
  assert.equal(result.score, 10)
  assert.equal(result.scorer, 'claude')
  assert.equal(result.category, 'humour')
  assert.equal(seen.url, 'https://api.anthropic.com/v1/messages')
  assert.equal(seen.headers['x-api-key'], 'sk-test')
  assert.equal(JSON.stringify(seen.body).includes('sk-test'), false)
})

test('claude scorer falls back to the heuristic on HTTP errors, bad JSON and network failures', async () => {
  for (const fetchFn of [
    (async () => ({ ok: false, status: 529, json: async () => ({}) })) as any,
    (async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'pas de json' }] }) })) as any,
    (async () => { throw new Error('reseau') }) as any
  ]) {
    const result = await createClaudeScorer({ apiKey: 'k', fetchFn }).score(candidate('Alors hier je suis alle au marche'))
    assert.equal(result.scorer, 'heuristic')
  }
})

function deps(peaks: any[], overrides: Partial<Parameters<typeof analyzeVod>[1]> = {}) {
  const transcribed: number[] = []
  return {
    transcribed,
    deps: {
      fetchChat: async () => [],
      detectPeaks: () => peaks,
      transcribePeak: async (p: any) => { transcribed.push(p.peakSec); return transcript(`Alors hier au marche ${p.peakSec}, franchement je pense que oui mdr`) },
      score: heuristicScorer.score,
      ...overrides
    }
  }
}

test('analyzeVod reports a calm chat so the reference bank can take over', async () => {
  const { deps: d } = deps([])
  assert.deepEqual(await analyzeVod({ keywords: [] }, d), { moments: [], peaksFound: 0, reason: 'chat_calm' })
})

test('analyzeVod keeps the strongest peaks, one per passage, and transcribes only those', async () => {
  const peaks = [peak(100, 6), peak(130, 9), peak(1000, 7), peak(2000, 5), peak(3000, 8)]
  const { deps: d, transcribed } = deps(peaks)
  const result = await analyzeVod({ keywords: ['mdr'], maxMoments: 3, minScore: 0, minGapSec: 90 }, d)
  assert.equal(result.peaksFound, 5)
  assert.deepEqual(transcribed.sort((a, b) => a - b), [130, 1000, 3000])
  assert.equal(result.moments.length, 3)
  assert.ok(result.moments[0].score.score >= result.moments[2].score.score)
})

test('analyzeVod skips a peak whose audio fails and drops notes below the minimum', async () => {
  const errors: number[] = []
  const { deps: d } = deps([peak(100, 9), peak(1000, 9)], {
    transcribePeak: async (p: any) => { if (p.peakSec === 100) throw new Error('audio'); return transcript('euh oui') },
    onError: (p: any) => { errors.push(p.peakSec) }
  })
  const result = await analyzeVod({ keywords: [], minScore: 9.5 }, d)
  assert.deepEqual(errors, [100])
  assert.equal(result.reason, 'nothing_kept')
})
