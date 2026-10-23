import test from 'node:test'
import assert from 'node:assert/strict'
import { detectChatPeaks, buildKeywordMatcher, isShouting, type ChatMessage } from './chatPeaks.ts'

function calmChat(durationSec: number): ChatMessage[] {
  const out: ChatMessage[] = []
  for (let t = 0; t < durationSec; t += 6) out.push({ t, text: 'salut tout le monde' })
  return out
}

function burst(startSec: number, count: number, text: string): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({ t: startSec + i * 0.3, text }))
}

test('calm chat yields no peaks', () => {
  assert.deepEqual(detectChatPeaks(calmChat(1800)), [])
})

test('empty input yields no peaks', () => {
  assert.deepEqual(detectChatPeaks([]), [])
})

test('keyword burst is detected with pre-roll before the peak', () => {
  const msgs = [...calmChat(1800), ...burst(600, 40, 'MDR PTDR')]
  const peaks = detectChatPeaks(msgs)
  assert.equal(peaks.length, 1)
  const [p] = peaks
  assert.ok(p.peakSec >= 595 && p.peakSec <= 615, `peakSec=${p.peakSec}`)
  assert.ok(p.startSec <= 600 - 5)
  assert.ok(p.score >= 7, `score=${p.score}`)
  assert.ok(p.signals.keywordShare > 0.9)
})

test('two distant bursts give two peaks, close ones are merged', () => {
  const far = detectChatPeaks([...calmChat(2400), ...burst(500, 40, 'lol'), ...burst(1500, 40, 'lol')])
  assert.equal(far.length, 2)
  const near = detectChatPeaks([...calmChat(2400), ...burst(500, 40, 'lol'), ...burst(520, 40, 'lol')])
  assert.equal(near.length, 1)
})

test('streamer-defined keywords drive the score on a modest rate increase', () => {
  const msgs = [...calmChat(1800), ...burst(900, 12, 'clutch')]
  const withoutKw = detectChatPeaks(msgs, { keywords: ['mdr'] })
  const withKw = detectChatPeaks(msgs, { keywords: ['clutch'] })
  assert.ok((withKw[0]?.score ?? 0) >= (withoutKw[0]?.score ?? 0))
  assert.ok(withKw.length >= 1)
})

test('keyword matcher handles elongation, accents and case', () => {
  const match = buildKeywordMatcher(['mdr', 'ptdr', 'omg'])
  assert.ok(match('MDRRRR'))
  assert.ok(match('ptdrrr trop fort'))
  assert.ok(match('Omggg!!'))
  assert.ok(!match('mdrxyz'))
  assert.ok(!match('bonjour'))
  assert.ok(buildKeywordMatcher(['élan'])('ELAN'))
})

test('shouting detection needs enough letters and mostly capitals', () => {
  assert.ok(isShouting('OH MON DIEU'))
  assert.ok(!isShouting('Oh mon dieu'))
  assert.ok(!isShouting('OK'))
})
