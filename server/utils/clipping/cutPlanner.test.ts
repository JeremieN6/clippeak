import test from 'node:test'
import assert from 'node:assert/strict'
import { planCut, trimSilences } from './cutPlanner.ts'

// Construit des segments a partir de "mots" regulierement espaces, avec des trous optionnels.
function speech(spec: Array<{ text: string, at: number, len?: number }>) {
  const words = spec.map(w => ({ start: w.at, end: w.at + (w.len ?? 0.3), text: w.text }))
  return [{ start: words[0].start, end: words[words.length - 1].end, text: words.map(w => w.text).join(' '), words }]
}

const words = (list: string[], from: number, step = 0.4) => list.map((text, i) => ({ text, at: from + i * step }))

test('trimSilences shortens long pauses and keeps short ones', () => {
  const w = [
    { start: 10, end: 10.3, text: 'a' },
    { start: 10.4, end: 10.7, text: 'b' },
    { start: 13, end: 13.3, text: 'c' }
  ]
  const ranges = trimSilences(w, 10, 13.3, { minSec: 1, maxSec: 60 })
  assert.equal(ranges.length, 2)
  assert.ok(ranges[0].end < 11)
  assert.ok(ranges[1].start > 12.5)
  const total = ranges.reduce((s, r) => s + r.end - r.start, 0)
  assert.ok(total < 3.3 - 1.5)
})

test('planCut starts on a sentence, ends just after the last word and reaches the minimum length', () => {
  const segs = [
    ...speech(words(['Alors', 'hier', 'je', 'suis', 'alle', 'au', 'marche.'], 100)),
    ...speech(words(['Et', 'la', 'le', 'mec', 'me', 'dit', 'rien', 'du', 'tout', 'mdr.'], 104)),
    ...speech(words(['Bref', 'voila', 'quoi.'], 112))
  ]
  const plan = planCut(segs, 108, { minSec: 6, maxSec: 40 })!
  assert.ok(plan.startSec <= 100.01)
  assert.ok(plan.startSec >= 99.5)
  assert.ok(plan.endSec >= 108)
  assert.ok(plan.endSec <= 108 + 1.5)
  assert.ok(/mdr\.$/.test(plan.lastWords))
  assert.equal(plan.hook.startsWith('Alors hier'), true)
})

test('planCut never exceeds the maximum length', () => {
  const long: any[] = []
  for (let i = 0; i < 12; i++) long.push(...speech(words(['phrase', 'numero', String(i) + '.'], 200 + i * 6)))
  const plan = planCut(long, 268, { minSec: 50, maxSec: 30 })!
  assert.ok(plan.endSec - plan.startSec <= 31)
})

test('planCut flags clips that cannot reach the minimum and handles empty transcripts', () => {
  const segs = speech(words(['Court.'], 50))
  const plan = planCut(segs, 50, { minSec: 30, maxSec: 60 })!
  assert.equal(plan.meetsMin, false)
  assert.equal(planCut([], 10, { minSec: 30, maxSec: 60 }), null)
})

test('planCut works with segments that have no word timings', () => {
  const plan = planCut([{ start: 10, end: 14, text: 'Une phrase.' }, { start: 15, end: 20, text: 'Et la chute.' }], 18, { minSec: 5, maxSec: 30 })!
  assert.ok(plan.endSec >= 20)
  assert.ok(plan.startSec <= 10.01)
})

test('planCut extends the end on the next finished sentences when the trimmed length is under the minimum', () => {
  const segs = [
    ...speech(words(['Alors', 'hier', 'je', 'suis', 'alle', 'au', 'marche.'], 100)),
    ...speech(words(['Et', 'la', 'le', 'mec', 'me', 'dit', 'rien', 'du', 'tout', 'mdr.'], 104)),
    ...speech(words(['Bref', 'voila', 'quoi.'], 112))
  ]
  const plan = planCut(segs, 108, { minSec: 12, maxSec: 40 })!
  assert.ok(plan.endSec > 113)
  assert.ok(/quoi.$/.test(plan.lastWords))
  assert.ok(plan.durationSec >= 12 || plan.endSec - plan.startSec <= 40)
  // et ne depasse jamais la duree maximale
  const capped = planCut(segs, 108, { minSec: 30, maxSec: 14 })!
  assert.ok(capped.endSec - capped.startSec <= 14.5)
})

test('planCut uses pauses as phrase boundaries when the transcript has no punctuation', () => {
  const w = (text: string, start: number) => ({ text, start, end: start + 0.3 })
  // groupes de mots separes par des pauses de 0,8 s, sans aucun point
  const flat = [
    w('alors', 100), w('hier', 100.4), w('au', 100.8), w('marche', 101.2),
    w('et', 102.3), w('le', 102.7), w('mec', 103.1), w('dit', 103.5), w('rien', 103.9),
    w('bref', 105), w('voila', 105.4), w('quoi', 105.8), w('donc', 107), w('fin', 107.4)
  ]
  const segs = [{ start: 100, end: 107.7, text: 'x', words: flat }]
  // minimum atteint : la fin tombe sur une pause (apres "quoi"), pas au milieu d'un groupe
  const plan = planCut(segs, 104.5, { minSec: 4, maxSec: 30 })!
  assert.ok(/quoi$/.test(plan.lastWords))
  assert.ok(plan.hook.startsWith('bref') || plan.hook.startsWith('et') || plan.hook.startsWith('alors'))
  // minimum plus haut : prolongation sur le groupe suivant, termine lui aussi sur une pause
  const longer = planCut(segs, 104.5, { minSec: 7, maxSec: 30 })!
  assert.ok(longer.endSec > plan.endSec)
  assert.ok(/fin$/.test(longer.lastWords))
})

test('planCut leaves a breathing tail after the punchline, bounded by the next word and by tailSec', () => {
  const lead = speech(words(['Alors', 'hier', 'je', 'suis', 'alle', 'au', 'marche', 'et', 'la', 'chute.'], 100, 0.35))
  const end = lead[0].end
  // La parole reprend bien plus tard : la marge atteint tailSec (1,2 s par defaut), plus long que l'ancien 0,5 s.
  const roomy = planCut([...lead, ...speech([{ text: 'Bref', at: end + 4 }])], 103, { minSec: 3, maxSec: 40 })!
  assert.ok(Math.abs(roomy.endSec - (end + 1.2)) < 0.01)
  assert.ok(planCut([...lead, ...speech([{ text: 'Bref', at: end + 4 }])], 103, { minSec: 3, maxSec: 40, tailSec: 0.5 })!.endSec - end < 0.51)
  // Le mot suivant arrive vite : on s'arrete avant lui, jamais au milieu.
  const tight = planCut([...lead, ...speech([{ text: 'Et', at: end + 0.35 }])], 103.4, { minSec: 3, maxSec: 40, graceSec: 0.1 })!
  assert.ok(tight.endSec < end + 0.35)
  assert.ok(tight.endSec - end >= 0.15)
})
