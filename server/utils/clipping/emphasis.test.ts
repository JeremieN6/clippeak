import test from 'node:test'
import assert from 'node:assert/strict'
import { pickEmphasisWords } from './emphasis.ts'
import { buildAss } from './assBuilder.ts'

// Mots a vitesse normale (~0,065 s par lettre), avec une pause optionnelle avant chacun.
function speak(parts: Array<string | [string, { stretch?: number, pauseBefore?: number }]>) {
  let t = 0
  return parts.map((part) => {
    const [text, opts] = typeof part === 'string' ? [part, {}] : part
    t += opts.pauseBefore ?? 0.05
    const duration = Math.max(0.15, 0.065 * text.replace(/\W/g, '').length) * (opts.stretch ?? 1)
    const word = { start: t, end: t + duration, text }
    t += duration
    return word
  })
}

const pickedWords = (words: ReturnType<typeof speak>, level: 'off' | 'low' | 'normal' | 'high') =>
  [...pickEmphasisWords(words, level)].sort((a, b) => a - b).map(i => words[i].text)

test('off picks nothing, and very short texts are left alone', () => {
  const words = speak(['il', 'a', 'dit', ['incroyable', { stretch: 2.5, pauseBefore: 0.5 }]])
  assert.equal(pickEmphasisWords(words, 'off').size, 0)
  assert.equal(pickEmphasisWords(words.slice(0, 2), 'high').size, 0)
})

test('a stretched word after a pause is chosen over plain words', () => {
  const words = speak(['alors', 'hier', 'je', 'suis', 'alle', 'voir', 'mon', 'voisin', 'et', 'il', 'a', ['reponse', { stretch: 2.2, pauseBefore: 0.4 }], 'normale'])
  assert.deepEqual(pickedWords(words, 'normal'), ['reponse'])
})

test('numbers and strong words are chosen even at a normal pace', () => {
  const words = speak(['ca', 'coute', '3000', 'euros', 'et', 'je', 'ne', 'le', 'ferai', 'jamais'])
  const picked = pickedWords(words, 'high')
  assert.ok(picked.includes('3000') || picked.includes('euros'))
  assert.ok(picked.includes('jamais'))
})

test('filler and empty words are never chosen, even when drawn out', () => {
  const words = speak(['donc', ['euh', { stretch: 4, pauseBefore: 0.45 }], ['alors', { stretch: 3 }], ['vraiment', { stretch: 3 }], 'je', 'pense', 'que'])
  assert.deepEqual(pickedWords(words, 'high'), [])
})

test('never two neighbouring words, never more than the share cap, and stronger levels pick at least as many', () => {
  const sentence = ['incroyable', 'impossible', 'jamais', 'personne', 'arnaque', 'scandale', 'millions', 'euros', 'honte', 'secret', 'dingue', 'enorme']
  const words = speak(sentence)
  const chosen = [...pickEmphasisWords(words, 'high')].sort((a, b) => a - b)
  for (let i = 1; i < chosen.length; i++) assert.ok(chosen[i] - chosen[i - 1] >= 2)
  assert.ok(chosen.length <= Math.floor(words.length * 0.24))
  const counts = (['low', 'normal', 'high'] as const).map(level => pickEmphasisWords(words, level).size)
  assert.ok(counts[0] <= counts[1] && counts[1] <= counts[2])
})

test('buildAss colours the chosen words, the always-highlight list still works, and off disables the automatic choice', () => {
  const words = speak(['alors', 'hier', 'je', 'suis', 'alle', 'voir', 'mon', 'voisin', 'et', 'il', 'a', ['reponse', { stretch: 2.2, pauseBefore: 0.4 }], 'normale'])
  const coloured = (emphasis: 'off' | 'normal', keywords: string[] = []) =>
    buildAss({ title: 'T', words, durationSec: 10, subtitleStyle: { emphasis, keywords, highlightColor: '#FF0000' } })
      .split('\n').filter(l => l.includes('\c&H')).map(l => l.split(',,').pop() ?? '')
  assert.deepEqual(coloured('normal'), ['{\\c&H000000FF}REPONSE'])
  assert.deepEqual(coloured('off'), [])
  assert.deepEqual(coloured('off', ['voisin']), ['{\\c&H000000FF}VOISIN'])
})
