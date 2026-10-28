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
  assert.ok(pickedWords(words, 'normal').includes('reponse'))
})

test('numbers and strong words are chosen even at a normal pace', () => {
  const words = speak(['ca', 'coute', '3000', 'euros', 'et', 'je', 'ne', 'le', 'ferai', 'jamais'])
  const picked = pickedWords(words, 'high')
  assert.ok(picked.includes('3000') || picked.includes('euros'))
  assert.ok(picked.includes('jamais'))
})

test('filler and empty words are never chosen, even when drawn out', () => {
  const words = speak(['donc', ['euh', { stretch: 4, pauseBefore: 0.45 }], ['alors', { stretch: 3 }], ['vraiment', { stretch: 3 }], 'je', 'pense', 'que'])
  const fillers = new Set(['donc', 'euh', 'alors', 'vraiment'])
  assert.ok(pickedWords(words, 'high').every(w => !fillers.has(w)))
})

test('never two neighbouring words and stronger levels pick at least as many', () => {
  const sentence = ['incroyable', 'impossible', 'jamais', 'personne', 'arnaque', 'scandale', 'millions', 'euros', 'honte', 'secret', 'dingue', 'enorme']
  const words = speak(sentence)
  const chosen = [...pickEmphasisWords(words, 'high')].sort((a, b) => a - b)
  for (let i = 1; i < chosen.length; i++) assert.ok(chosen[i] - chosen[i - 1] >= 2)
  const counts = (['low', 'normal', 'high'] as const).map(level => pickEmphasisWords(words, level).size)
  assert.ok(counts[0] <= counts[1] && counts[1] <= counts[2])
})

test('plain speech still gets an accent colour at a regular, spaced and repeatable rhythm', () => {
  const plain = ['maison', 'jardin', 'cuisine', 'fenetre', 'voiture', 'chemin', 'bureau', 'chaise', 'lumiere', 'montagne']
  const words = speak(Array.from({ length: 40 }, (_, i) => plain[i % plain.length]))
  for (const [level, maxGap] of [['low', 12], ['normal', 7], ['high', 5]] as const) {
    const chosen = [...pickEmphasisWords(words, level)].sort((a, b) => a - b)
    assert.ok(chosen.length >= Math.floor(40 / (maxGap + 4)), level)
    for (let i = 1; i < chosen.length; i++) {
      assert.ok(chosen[i] - chosen[i - 1] >= 3, `${level}: spaced`)
      assert.ok(chosen[i] - chosen[i - 1] - 1 <= maxGap, `${level}: regular`)
    }
    assert.deepEqual([...pickEmphasisWords(words, level)].sort((a, b) => a - b), chosen)
  }
  assert.equal(pickEmphasisWords(words, 'off').size, 0)
})

test('buildAss colours the chosen words, the always-highlight list still works, and off disables the automatic choice', () => {
  const words = speak(['alors', 'hier', 'je', 'suis', 'alle', 'voir', 'mon', 'voisin', 'et', 'il', 'a', ['reponse', { stretch: 2.2, pauseBefore: 0.4 }], 'normale'])
  const coloured = (emphasis: 'off' | 'normal', keywords: string[] = []) =>
    buildAss({ title: 'T', words, durationSec: 10, subtitleStyle: { emphasis, keywords, highlightColor: '#FF0000' } })
      .split('\n').filter(l => l.includes('\c&H')).map(l => l.split(',,').pop() ?? '')
  assert.ok(coloured('normal').includes('{\\c&H000000FF}REPONSE'))
  assert.deepEqual(coloured('off'), [])
  assert.deepEqual(coloured('off', ['voisin']), ['{\\c&H000000FF}VOISIN'])
})
