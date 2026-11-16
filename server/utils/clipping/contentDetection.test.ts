import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CREATOR_DETECTION_HOURS, FREE_DETECTION_HOURS, buildWindows, chatBonus, detectionCapSec, detectionPrompt, detectionSecLeft, parseContentCandidates,
  parseDetectionMode, selectContentMoments, shouldDetect, snapMoment, toAnalyzedMoment, usesChat, usesContent
} from './contentDetection.ts'
import type { ContentCandidate } from './contentDetection.ts'
import { createContentFinder } from './contentDetectionLlm.ts'
import { LongLlmError } from './longAnalysisLlm.ts'
import { GROQ_URL, RemoteTranscribeError, parseGroqResponse, parseRetryAfter, transcribeRemote } from './remoteTranscribe.ts'
import { createAlertThrottle, groqAlertMessage, groqWaitMs, groqWaitNote, isGroqWaitNote, transcribeAuto } from './transcribeAuto.ts'
import type { TranscriptSegment } from './whisperTranscribe.ts'
import type { ChatPeak } from './chatPeaks.ts'

// Un « live » de 200 phrases de 10 s (une phrase = 9 s de parole, 1 s de pause) : phrase i = [i*10, i*10 + 9].
const segs: TranscriptSegment[] = Array.from({ length: 200 }, (_, i) => ({ start: i * 10, end: i * 10 + 9, text: `phrase ${i}`, words: [{ start: i * 10, end: i * 10 + 9, text: `phrase${i}` }] }))
const cand = (patch: Partial<ContentCandidate> = {}): ContentCandidate => ({ startSec: 100, endSec: 139, hook: 'phrase 10', title: 'Mon histoire', category: 'histoire', kind: 'story', score: 8, why: 'Bonne chute.', ...patch })
const peak = (patch: Partial<ChatPeak> = {}): ChatPeak => ({ startSec: 120, endSec: 140, peakSec: 135, score: 7, signals: { messages: 30, rateZ: 4, keywordShare: 0.3, capsShare: 0.1 }, ...patch })

test('detection modes: unknown values fall back to content + chat, and each mode says what it uses', () => {
  assert.equal(parseDetectionMode('chat'), 'chat')
  assert.equal(parseDetectionMode('nimporte'), 'both')
  assert.equal(parseDetectionMode(undefined), 'both')
  assert.deepEqual([usesContent('both'), usesChat('both')], [true, true])
  assert.deepEqual([usesContent('content'), usesChat('content')], [true, false])
  assert.deepEqual([usesContent('chat'), usesChat('chat')], [false, true])
})

test('the monthly analysis cap: 10 h free, 100 h Creator, unlimited for exempt channels, never negative', () => {
  assert.equal(detectionCapSec({ paying: false, unlimited: false }), FREE_DETECTION_HOURS * 3600)
  assert.equal(detectionCapSec({ paying: true, unlimited: false }), CREATOR_DETECTION_HOURS * 3600)
  assert.equal(detectionCapSec({ paying: false, unlimited: true }), null)
  assert.equal(detectionSecLeft(36000, 30000), 6000)
  assert.equal(detectionSecLeft(36000, 99999), 0)
  assert.equal(detectionSecLeft(null, 99999), Number.POSITIVE_INFINITY)
})

test('buildWindows gives one line per phrase with its time, overlapping windows, and only the requested range', () => {
  const windows = buildWindows(segs, 0, 2000, { windowSec: 1200, overlapSec: 240 })
  assert.equal(windows[0]!.startSec, 0)
  assert.ok(windows[0]!.text.startsWith('[0:00:00] phrase 0\n[0:00:10] phrase 1'))
  assert.equal(windows[1]!.startSec, 960)
  assert.ok(windows[0]!.text.includes('phrase 110') && windows[1]!.text.includes('phrase 110'))
  assert.equal(windows.at(-1)!.endSec, 2000)
  assert.deepEqual(buildWindows([], 0, 1000), [])
  // Reprise apres une lecture precedente : on ne relit que la partie nouvelle.
  const later = buildWindows(segs, 1500, 2000)
  assert.ok(!later[0]!.text.includes('phrase 0\n') && later[0]!.text.includes('phrase 150'))
})

test('the prompt asks for 20 to 60 s moments with a hook and a punchline, and carries what we know of the streamer', () => {
  const prompt = detectionPrompt(20, 60, { styleNotes: 'sujets : foot' })
  assert.ok(prompt.includes('20 a 60 secondes') && prompt.includes('accroche') && prompt.includes('chute'))
  assert.ok(prompt.includes('sujets : foot'))
  assert.ok(!detectionPrompt().includes('undefined'))
})

test('parseContentCandidates reads a JSON array wrapped in text and ignores invalid entries', () => {
  const text = 'Voici :\n[{"start": 100, "end": "139,5", "hook": "Alors  là", "title": "Mon « top » moment", "category": "humour", "kind": "punchline", "score": 9.44, "why": "Bien"},\n{"start": 90, "end": 80, "score": 5},\n{"start": 10, "end": 50}]\nMerci'
  const out = parseContentCandidates(text)
  assert.equal(out.length, 1)
  assert.deepEqual([out[0]!.startSec, out[0]!.endSec, out[0]!.title, out[0]!.score, out[0]!.kind, out[0]!.hook], [100, 139.5, 'Mon top moment', 9.4, 'punchline', 'Alors là'])
  assert.equal(parseContentCandidates('[{"start":0,"end":30,"score":42,"kind":"zzz"}]')[0]!.kind, 'other')
  assert.deepEqual(parseContentCandidates('pas de json'), [])
  assert.deepEqual(parseContentCandidates('[{"start": 1,'), [])
})

test('snapMoment puts the moment on whole phrases, shortens one that is too long, and drops one that is too short', () => {
  const snapped = snapMoment(cand({ startSec: 103, endSec: 136 }), segs)!
  assert.deepEqual([snapped.startSec, snapped.endSec], [100, 139])
  const long = snapMoment(cand({ startSec: 100, endSec: 220 }), segs)!
  assert.equal(long.endSec, 159)
  assert.equal(snapMoment(cand({ startSec: 100, endSec: 112 }), segs), null)
  assert.equal(snapMoment(cand(), []), null)
})

test('selectContentMoments keeps the best notes, never overlapping, never on an instant already taken, and drops weak notes', () => {
  const candidates = [
    cand({ startSec: 100, endSec: 139, score: 7 }),
    cand({ startSec: 110, endSec: 149, score: 9 }), // recouvre le premier, meilleur : il gagne
    cand({ startSec: 500, endSec: 539, score: 8 }),
    cand({ startSec: 900, endSec: 939, score: 3 }), // note trop faible
    cand({ startSec: 1200, endSec: 1239, score: 8 }), // deja pris
    cand({ startSec: 1500, endSec: 1509, score: 9 }) // trop court
  ]
  const chosen = selectContentMoments(candidates, segs, { max: 5, existingPeaks: [1220] })
  assert.deepEqual(chosen.map(c => c.startSec), [110, 500])
  assert.equal(selectContentMoments(candidates, segs, { max: 1 }).length, 1)
  // Un moment qui deborde la fin du transcrit utilisable est garde pour la lecture suivante.
  assert.deepEqual(selectContentMoments(candidates, segs, { max: 5, limitSec: 300 }).map(c => c.startSec), [110])
})

test('chat only adds a bonus: +1, +1.5 for a strong reaction, nothing when the chat is calm or reacted elsewhere', () => {
  assert.equal(chatBonus({ startSec: 100, endSec: 139 }, []).bonus, 0)
  assert.equal(chatBonus({ startSec: 100, endSec: 139 }, [peak({ peakSec: 135, score: 4 })]).bonus, 1)
  assert.equal(chatBonus({ startSec: 100, endSec: 139 }, [peak({ peakSec: 142, score: 8 })]).bonus, 1.5)
  assert.equal(chatBonus({ startSec: 100, endSec: 139 }, [peak({ peakSec: 600 })]).bonus, 0)
})

test('toAnalyzedMoment: the punchline is the peak, the source window covers the clip, a live without chat still gives a valid moment', () => {
  const calm = toAnalyzedMoment(cand({ startSec: 100, endSec: 159, score: 8 }), segs)
  assert.equal(calm.peak.peakSec, 157)
  assert.equal(calm.score.score, 8)
  assert.deepEqual(calm.peak.signals, { messages: 0, rateZ: 0, keywordShare: 0, capsShare: 0 })
  assert.ok(calm.score.rationale.startsWith('detecte par le contenu du live'))
  // L'extrait source garde 60 s avant le pic : le moment de 59 s y tient en entier.
  assert.ok(calm.peak.peakSec - 60 <= calm.peak.startSec)
  assert.ok(calm.transcript.segments.length > 0 && calm.transcript.segments[0]!.words?.length)
  assert.ok(calm.transcript.beforePeak.includes('phrase 10') && !calm.transcript.beforePeak.includes('phrase 16'))

  const withChat = toAnalyzedMoment(cand({ score: 8 }), segs, { peaks: [peak()] })
  assert.equal(withChat.score.score, 9.5)
  assert.ok(withChat.score.rationale.includes('le chat a reagi'))
  assert.equal(toAnalyzedMoment(cand({ score: 9.5 }), segs, { peaks: [peak()] }).score.score, 10)
  // La note retenue peut venir de la comparaison avec les clips de reference.
  assert.equal(toAnalyzedMoment(cand({ score: 8 }), segs, { similarityScore: 6.5 }).score.score, 6.5)
})

test('shouldDetect waits for 30 minutes of new transcript while live, and reads the rest once the live is over', () => {
  assert.equal(shouldDetect({ transcribedSec: 1000, detectedSec: 0, finished: false }), false)
  assert.equal(shouldDetect({ transcribedSec: 1800, detectedSec: 0, finished: false }), true)
  assert.equal(shouldDetect({ transcribedSec: 1850, detectedSec: 1800, finished: true }), false)
  assert.equal(shouldDetect({ transcribedSec: 2000, detectedSec: 1800, finished: true }), true)
})

const okResponse = (text: string) => new Response(JSON.stringify({ content: [{ text }] }), { status: 200 })

test('the Claude finder sends the style notes and returns the moments; errors are NOT hidden', async () => {
  let sent: any
  const find = createContentFinder({ apiKey: 'k', styleNotes: 'sujets : foot', track: () => {}, fetchFn: (async (_url: string, init: any) => { sent = JSON.parse(init.body); return okResponse('[{"start":100,"end":139,"score":8,"title":"T"}]') }) as any })
  const out = await find({ startSec: 0, endSec: 1800, text: '[0:00:00] salut' })
  assert.equal(out.length, 1)
  assert.ok(sent.system.includes('sujets : foot') && sent.messages[0].content.includes('[0:00:00] salut'))
  const empty = createContentFinder({ apiKey: 'k', track: () => {}, fetchFn: (async () => okResponse('[]')) as any })
  assert.deepEqual(await empty({ startSec: 0, endSec: 1, text: 'x' }), [])
  const refused = createContentFinder({ apiKey: 'k', track: () => {}, fetchFn: (async () => new Response('', { status: 401 })) as any })
  await assert.rejects(() => refused({ startSec: 0, endSec: 1, text: 'x' }), (e: any) => e instanceof LongLlmError && !e.retryable)
  const busy = createContentFinder({ apiKey: 'k', track: () => {}, fetchFn: (async () => new Response('', { status: 429 })) as any })
  await assert.rejects(() => busy({ startSec: 0, endSec: 1, text: 'x' }), (e: any) => e instanceof LongLlmError && e.retryable)
  const odd = createContentFinder({ apiKey: 'k', track: () => {}, fetchFn: (async () => okResponse('desole')) as any })
  await assert.rejects(() => odd({ startSec: 0, endSec: 1, text: 'x' }), LongLlmError)
})

test('parseGroqResponse attaches the words to their phrase and drops phrases Whisper itself judges silent', () => {
  const out = parseGroqResponse({
    duration: 20,
    segments: [{ start: 0, end: 5, text: ' Bonjour tout le monde ', no_speech_prob: 0.01 }, { start: 5, end: 9, text: 'Sous-titres par une communauté', no_speech_prob: 0.95 }, { start: 9, end: 12, text: 'Salut' }],
    words: [{ word: 'Bonjour', start: 0.1, end: 0.6 }, { word: 'tout', start: 0.7, end: 0.9 }, { word: 'Salut', start: 9.2, end: 9.8 }]
  })
  assert.equal(out.segments.length, 2)
  assert.deepEqual(out.segments[0]!.words!.map(w => w.text), ['Bonjour', 'tout'])
  assert.equal(out.segments[1]!.text, 'Salut')
  assert.equal(out.audioSec, 20)
  assert.throws(() => parseGroqResponse({}), /segments/)
})

test('transcribeRemote sends the audio to Groq with the secret in the header only, and maps errors', async () => {
  let call: any
  const ok = await transcribeRemote('x.wav', {
    apiKey: 'SECRET', readFileFn: async () => Buffer.from('RIFF'),
    fetchFn: (async (url: string, init: any) => { call = { url, init }; return new Response(JSON.stringify({ duration: 3, segments: [{ start: 0, end: 3, text: 'ok' }] }), { status: 200 }) }) as any
  })
  assert.equal(ok.segments[0]!.text, 'ok')
  assert.equal(call.url, GROQ_URL)
  assert.equal(call.init.headers.authorization, 'Bearer SECRET')
  assert.equal(call.init.body.get('language'), 'fr')
  assert.ok(!String(call.url).includes('SECRET'))
  const failing = (status: number) => transcribeRemote('x.wav', { apiKey: 'k', readFileFn: async () => Buffer.from('x'), fetchFn: (async () => new Response('', { status })) as any })
  await assert.rejects(() => failing(401), (e: any) => !e.retryable && e.kind === 'key' && !e.message.includes('k'))
  await assert.rejects(() => failing(429), (e: any) => e.retryable && e.kind === 'rate')
  await assert.rejects(() => failing(503), (e: any) => e.retryable && e.kind === 'outage')
  await assert.rejects(() => failing(400), (e: any) => !e.retryable && e.kind === 'other')
  const network = transcribeRemote('x.wav', { apiKey: 'k', readFileFn: async () => Buffer.from('x'), fetchFn: (async () => { throw new Error('reseau') }) as any })
  await assert.rejects(() => network, (e: any) => e.retryable && e.kind === 'outage')
})

test('the 429 answer carries the Retry-After wait of the service', async () => {
  const limited = transcribeRemote('x.wav', { apiKey: 'k', readFileFn: async () => Buffer.from('x'), fetchFn: (async () => new Response('', { status: 429, headers: { 'retry-after': '90' } })) as any })
  await assert.rejects(() => limited, (e: any) => e.kind === 'rate' && e.retryAfterMs === 90_000)
  assert.equal(parseRetryAfter('30'), 30_000)
  assert.equal(parseRetryAfter(new Date(Date.now() + 60_000).toUTCString(), Date.now()) !== null, true)
  assert.equal(parseRetryAfter('n’importe quoi'), null)
  assert.equal(parseRetryAfter(null), null)
})

test('transcribeAuto uses the external service first', async () => {
  const result = { segments: [], audioSec: 1, transcribeSec: 1 }
  let localCalls = 0
  const local = async () => { localCalls++; return result }
  assert.equal((await transcribeAuto('a.wav', { remote: async () => result, local })).provider, 'groq')
  assert.equal(localCalls, 0)
})

test('transcribeAuto never falls back to the local Whisper unless it is allowed', async () => {
  const result = { segments: [], audioSec: 1, transcribeSec: 1 }
  let localCalls = 0
  const local = async () => { localCalls++; return result }
  const errors: unknown[] = []
  // Groq en panne, cle refusee, limite de debit : l'erreur remonte, le serveur ne transcrit pas.
  for (const kind of ['outage', 'key', 'rate'] as const) {
    await assert.rejects(() => transcribeAuto('a.wav', { remote: async () => { throw new RemoteTranscribeError('x', kind !== 'key', kind) }, local, onRemoteError: e => errors.push(e) }), (e: any) => e.kind === kind)
  }
  assert.equal(localCalls, 0)
  assert.equal(errors.length, 3)
  // Sans service externe ni repli autorise : rien n'est transcrit en local non plus.
  await assert.rejects(() => transcribeAuto('a.wav', { remote: null, local }), /Aucun service/)
  assert.equal(localCalls, 0)
})

test('transcribeAuto falls back to the local Whisper only with the explicit setting, and still reports the failure', async () => {
  const result = { segments: [], audioSec: 1, transcribeSec: 1 }
  let localCalls = 0
  const local = async () => { localCalls++; return result }
  let reported = 0
  const out = await transcribeAuto('a.wav', { remote: async () => { throw new RemoteTranscribeError('limite', true, 'rate') }, local, localFallback: true, onRemoteError: () => { reported++ } })
  assert.equal(out.provider, 'local')
  assert.equal(localCalls, 1)
  assert.equal(reported, 1)
  // Pas de cle Groq mais repli autorise : Whisper local seul.
  assert.equal((await transcribeAuto('a.wav', { remote: null, local, localFallback: true })).provider, 'local')
})

test('the wait after a Groq problem grows 5, 10, 20 minutes, honours Retry-After and stays under an hour', () => {
  assert.equal(groqWaitMs(1, null), 5 * 60_000)
  assert.equal(groqWaitMs(2, null), 10 * 60_000)
  assert.equal(groqWaitMs(3, null), 20 * 60_000)
  assert.equal(groqWaitMs(9, null), 20 * 60_000)
  assert.equal(groqWaitMs(1, 15 * 60_000), 15 * 60_000)
  assert.equal(groqWaitMs(3, 60_000), 20 * 60_000)
  assert.equal(groqWaitMs(1, 3 * 3600_000), 3600_000)
  assert.equal(groqWaitMs(0, null), 5 * 60_000)
})

test('the admin is alerted once per hour and per cause, in French, without any key', () => {
  const throttle = createAlertThrottle()
  const t0 = 1_000_000
  assert.equal(throttle.shouldAlert('rate', t0), true)
  assert.equal(throttle.shouldAlert('rate', t0 + 59 * 60_000), false)
  assert.equal(throttle.shouldAlert('key', t0 + 60_000), true)
  assert.equal(throttle.shouldAlert('rate', t0 + 61 * 60_000), true)
  for (const cause of ['key', 'rate', 'outage'] as const) {
    for (const fallback of [true, false]) {
      const text = groqAlertMessage(cause, fallback)
      assert.match(text, /Groq/)
      // Le nom de la variable peut apparaitre, jamais une valeur de cle.
      assert.ok(!/gsk_|Bearer|https?:/i.test(text))
    }
  }
  assert.match(groqAlertMessage('rate', false), /repli local désactivé/)
  assert.match(groqAlertMessage('rate', true), /Whisper local/)
})

test('a waiting live is marked in the database with a clear message that the capacity tab can count', () => {
  for (const cause of ['key', 'rate', 'outage'] as const) {
    const note = groqWaitNote(cause)
    assert.equal(isGroqWaitNote(note), true)
    assert.ok(note.length < 500)
  }
  assert.equal(isGroqWaitNote(null), false)
  assert.equal(isGroqWaitNote('Claude est injoignable'), false)
})
