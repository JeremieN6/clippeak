import test from 'node:test'
import assert from 'node:assert/strict'
import { analysisProgress, buildChunks, compactSegments, defaultCandidateLimit, parseCandidates, selectProposals, snapCandidate, systemPrompt } from './longAnalysis.ts'
import type { Candidate, Seg } from './longAnalysis.ts'
import { createLongCandidateFinder, LongLlmError } from './longAnalysisLlm.ts'
import { stepAnalysis } from './longAnalysisRun.ts'
import type { AnalysisDeps, AnalysisJob, AnalysisStore, NewAnalysisProposal } from './longAnalysisRun.ts'

// Un « live » de 100 phrases de 30 s : phrase i = [i*30, i*30 + 28].
const segs: Seg[] = Array.from({ length: 100 }, (_, i) => ({ s: i * 30, e: i * 30 + 28, t: `phrase ${i}` }))
const cand = (patch: Partial<Candidate> = {}): Candidate => ({ startSec: 300, endSec: 780, title: 'Mon classement', theme: 'Classement des gardiens', score: 8, why: 'Un vrai sujet.', ...patch })

test('compactSegments rounds times, applies the offset of the slice and drops empty phrases', () => {
  const out = compactSegments([{ start: 1.234, end: 3.456, text: '  Bonjour   tout le monde ' }, { start: 4, end: 4, text: 'vide' }, { start: 5, end: 6, text: '   ' }], 600)
  assert.deepEqual(out, [{ s: 601.2, e: 603.5, t: 'Bonjour tout le monde' }])
})

test('buildChunks cuts the transcript into overlapping windows, one line per phrase with its time in the live', () => {
  const chunks = buildChunks(segs, { chunkSec: 1200, overlapSec: 240 })
  assert.equal(chunks[0].startSec, 0)
  assert.ok(chunks[0].text.startsWith('[0:00:00] phrase 0\n[0:00:30] phrase 1'))
  assert.ok(chunks[1].startSec === 960 && chunks[1].text.includes('[0:16:30] phrase 33'))
  // Le recouvrement : une phrase a 17 minutes est dans les deux premieres fenetres.
  assert.ok(chunks[0].text.includes('phrase 34') && chunks[1].text.includes('phrase 34'))
  assert.equal(chunks.at(-1)!.endSec, segs.at(-1)!.e)
  assert.deepEqual(buildChunks([]), [])
})

test('parseCandidates reads a JSON array wrapped in text and ignores invalid entries', () => {
  const text = 'Voici :\n[{"start": 300, "end": "780,5", "title": "Mon « top » des gardiens", "theme": "Gardiens", "score": 9.44, "why": "Bien"},\n{"start": 900, "end": 800, "title": "Fin avant début", "score": 5},\n{"start": 10, "end": 500, "title": "", "score": 5},\n{"start": 10, "end": 500, "title": "Sans note"}]\nMerci'
  const out = parseCandidates(text)
  assert.equal(out.length, 1)
  assert.deepEqual([out[0].startSec, out[0].endSec, out[0].title, out[0].score], [300, 780.5, 'Mon top des gardiens', 9.4])
  assert.deepEqual(parseCandidates('[]'), [])
  assert.deepEqual(parseCandidates('pas de json'), [])
  assert.deepEqual(parseCandidates('[{"start": 1,'), [])
  assert.equal(parseCandidates('[{"start":0,"end":300,"title":"x","score":42}]')[0].score, 10)
})

test('snapCandidate puts the passage on the start of a phrase and the end of a phrase', () => {
  const snapped = snapCandidate(cand({ startSec: 311, endSec: 779 }), segs)
  assert.deepEqual([snapped.startSec, snapped.endSec], [300, 778])
})

test('selectProposals keeps valid, non-overlapping passages, best first, and respects what is already taken', () => {
  const list = [
    cand({ startSec: 0, endSec: 300, score: 7, title: 'A' }),
    cand({ startSec: 100, endSec: 400, score: 9, title: 'B (chevauche A et C)' }),
    cand({ startSec: 600, endSec: 900, score: 6, title: 'C' }),
    cand({ startSec: 1200, endSec: 1260, score: 10, title: 'trop court' }),
    cand({ startSec: 1500, endSec: 1800, score: 8, title: 'D' })
  ]
  const out = selectProposals(list, segs, { maxSec: 600 })
  assert.deepEqual(out.map(c => c.title), ['B (chevauche A et C)', 'C', 'D'])
  // Deja pris (ignore, prepare ou ajoute a la main) : on n'y revient pas.
  assert.deepEqual(selectProposals(list, segs, { maxSec: 600, taken: [{ startSec: 1500, endSec: 1800 }] }).map(c => c.title), ['B (chevauche A et C)', 'C'])
  assert.equal(selectProposals(list, segs, { maxSec: 600, max: 1 }).length, 1)
})

test('selectProposals shortens a passage that is too long to the last phrase that fits, and never goes past the end of the live', () => {
  const [long] = selectProposals([cand({ startSec: 0, endSec: 1500 })], segs, { maxSec: 600 })
  assert.deepEqual([long.startSec, long.endSec], [0, 598])
  const [cut] = selectProposals([cand({ startSec: 0, endSec: 400 })], segs, { maxSec: 600, vodDurationSec: 150 })
  assert.equal(cut, undefined)
  const [edge] = selectProposals([cand({ startSec: 0, endSec: 400 })], segs, { maxSec: 600, vodDurationSec: 330 })
  assert.equal(edge.endSec, 330)
})

test('defaultCandidateLimit, analysisProgress and systemPrompt', () => {
  assert.equal(defaultCandidateLimit(1800), 3)
  assert.equal(defaultCandidateLimit(4 * 3600), 8)
  assert.equal(defaultCandidateLimit(10 * 3600), 8)
  assert.equal(analysisProgress('queued', 0, null), 0)
  assert.equal(analysisProgress('running', 1800, 7200), 22)
  assert.equal(analysisProgress('running', 7195, 7200), 95)
  assert.equal(analysisProgress('done', 7200, 7200), 100)
  assert.match(systemPrompt(180, 600), /entre 180 et 600 secondes/)
})

function fakeClaude(reply: () => Response) {
  const calls: any[] = []
  const fetchFn = (async (_url: any, init: any) => { calls.push(JSON.parse(init.body)); return reply() }) as unknown as typeof fetch
  return { fetchFn, calls }
}
const ok = (text: string) => Response.json({ content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5 } })
const chunk = { text: '[0:00:00] salut', startSec: 0, endSec: 1800 }

test('the Claude finder sends the transcript with the duration limits, reads the answer, and reports the cost', async () => {
  const tracked: unknown[] = []
  const { fetchFn, calls } = fakeClaude(() => ok('[{"start":0,"end":300,"title":"Un sujet","theme":"t","score":7,"why":"w"}]'))
  const find = createLongCandidateFinder({ apiKey: 'k', fetchFn, track: body => tracked.push(body) })
  const out = await find(chunk, { minSec: 180, maxSec: 600 })
  assert.equal(out.length, 1)
  assert.match(calls[0].system, /entre 180 et 600 secondes/)
  assert.ok(calls[0].messages[0].content.includes('[0:00:00] salut'))
  assert.equal(tracked.length, 1)
  assert.deepEqual(await createLongCandidateFinder({ apiKey: 'k', fetchFn: fakeClaude(() => ok('[]')).fetchFn })(chunk, { minSec: 180, maxSec: 600 }), [])
})

test('the Claude finder fails visibly: refused key is final, overload or network is retryable, no array is an error', async () => {
  const run = (reply: () => Response) => createLongCandidateFinder({ apiKey: 'k', fetchFn: fakeClaude(reply).fetchFn, track: () => {} })(chunk, { minSec: 180, maxSec: 600 }).then(() => null, e => e as LongLlmError)
  const refused = await run(() => new Response('no', { status: 401 }))
  assert.deepEqual([refused?.retryable, refused?.message], [false, 'La clé Claude du serveur est refusée'])
  assert.equal((await run(() => new Response('busy', { status: 529 })))?.retryable, true)
  assert.equal((await run(() => new Response('slow', { status: 429 })))?.retryable, true)
  assert.equal((await run(() => ok('désolé, je ne peux pas')))?.retryable, true)
  const down = createLongCandidateFinder({ apiKey: 'k', fetchFn: (async () => { throw new Error('reseau') }) as unknown as typeof fetch })
  assert.equal((await down(chunk, { minSec: 180, maxSec: 600 }).catch(e => e)).retryable, true)
})

function memory(job: Partial<AnalysisJob> = {}) {
  const state: AnalysisJob = { id: 'a1', vodId: 'v1', channelId: 'c1', twitchVodId: '999', vodTitle: 'Live', status: 'queued', transcribedSec: 0, durationSec: 3000, transcript: [], maxSec: 600, taken: [], ...job }
  const log: string[] = []
  let finished: NewAnalysisProposal[] | null = null
  const store: AnalysisStore = {
    next: async () => state,
    markRunning: async (_id, d) => { state.status = 'running'; state.durationSec = d; log.push(`running:${d}`) },
    appendTranscript: async (_id, s, t) => { state.transcript = [...state.transcript, ...s]; state.transcribedSec = t; log.push(`transcribed:${t}`) },
    finish: async (_j, p) => { finished = p; state.status = 'done' },
    fail: async () => {}
  }
  return { state, log, store, finished: () => finished }
}
const deps = (store: AnalysisStore, patch: Partial<AnalysisDeps> = {}): AnalysisDeps => ({
  store,
  probeDurationSec: async () => 3000,
  transcribeSlice: async (_j, start, length) => [{ s: start, e: start + length - 2, t: `texte ${start}` }],
  findCandidates: async () => [cand({ startSec: 0, endSec: 598, score: 8 })],
  ...patch
})

test('stepAnalysis transcribes slice by slice, then searches the passages and creates the proposals once', async () => {
  const m = memory({ durationSec: 600 })
  assert.equal(await stepAnalysis(m.state, deps(m.store)), 'transcribed')
  assert.equal(m.state.transcribedSec, 300)
  assert.equal(await stepAnalysis(m.state, deps(m.store)), 'transcribed')
  assert.equal(m.state.transcribedSec, 600)
  assert.equal(await stepAnalysis(m.state, deps(m.store, { findCandidates: async () => [cand({ startSec: 0, endSec: 298, score: 8, title: 'Sujet' })] })), 'finished')
  assert.deepEqual(m.finished()!.map(p => [p.title, p.startSec, p.endSec, p.score]), [['Sujet', 0, 298, 8]])
})

test('stepAnalysis reads the length of the live when it is unknown, and reuses a complete transcript on a relaunch', async () => {
  const unknown = memory({ durationSec: null })
  await stepAnalysis(unknown.state, deps(unknown.store, { probeDurationSec: async () => 1200 }))
  assert.deepEqual(unknown.log, ['running:1200', 'transcribed:300'])
  // Relance : transcription complete, aucune tranche refaite.
  let sliceCalls = 0
  const relaunch = memory({ transcribedSec: 3000, transcript: segs })
  assert.equal(await stepAnalysis(relaunch.state, deps(relaunch.store, { transcribeSlice: async () => { sliceCalls++; return [] } })), 'finished')
  assert.equal(sliceCalls, 0)
  // Un echec de Claude laisse la transcription intacte : rien n'est cree.
  const broken = memory({ transcribedSec: 3000, transcript: segs })
  await assert.rejects(stepAnalysis(broken.state, deps(broken.store, { findCandidates: async () => { throw new LongLlmError('Claude indisponible', true) } })), /Claude indisponible/)
  assert.equal(broken.finished(), null)
  assert.equal(broken.state.transcript.length, 100)
})
