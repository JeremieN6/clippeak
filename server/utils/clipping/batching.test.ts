import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assignBatches, isBatchReadyForReview } from './batching.ts'
import { placeIllustrations, scanIllustrationFolder, tagsFromFilename } from './illustrations.ts'
import { runFfmpeg } from './ffmpegRunner.ts'

test('assignBatches groups the best clips by 4 and flags an incomplete last batch', () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, score: i }))
  const result = assignBatches(items)
  assert.deepEqual(result.slice(0, 4).map(r => r.id), ['c8', 'c7', 'c6', 'c5'])
  assert.deepEqual([...new Set(result.map(r => r.batch))], [1, 2, 3])
  assert.equal(result.find(r => r.id === 'c8')!.complete, true)
  assert.equal(result.find(r => r.id === 'c0')!.complete, false)
  assert.equal(assignBatches([{ id: 'x', score: 1 }], 7)[0].batch, 8)
  assert.deepEqual(assignBatches([]), [])
})

test('a batch is ready for review only once nothing is queued or rendering', () => {
  assert.equal(isBatchReadyForReview(['review', 'review', 'review', 'review']), true)
  assert.equal(isBatchReadyForReview(['review', 'failed', 'review', 'review']), true)
  assert.equal(isBatchReadyForReview(['review', 'rendering', 'review', 'review']), false)
  assert.equal(isBatchReadyForReview(['queued']), false)
  assert.equal(isBatchReadyForReview(['failed', 'failed']), false)
  assert.equal(isBatchReadyForReview(['approved', 'approved']), false)
  assert.equal(isBatchReadyForReview([]), false)
})

test('tagsFromFilename extracts meaningful accent-free tags', () => {
  assert.deepEqual(tagsFromFilename('Pomme-de-terre_cuisine.MP4'), ['pomme', 'terre', 'cuisine'])
  assert.deepEqual(tagsFromFilename('un_et_le.mp4'), [])
})

const lib = [
  { path: 'marche.mp4', tags: ['marche', 'legumes'], source: 'https://example.com/marche', durationSec: 5 },
  { path: 'thanos.mp4', tags: ['thanos'], source: 'credit B', durationSec: 3 },
  { path: 'rien.mp4', tags: ['dragon'], source: 'x', durationSec: 3 }
]
const w = (text: string, start: number) => ({ text, start, end: start + 0.3 })

test('placeIllustrations places a video at the first mention, keeps the source and skips unmatched videos', () => {
  const words = [w('Hier', 2), w('au', 2.4), w('marché', 3.1), w('et', 3.6), w('Thanos', 15)]
  const placed = placeIllustrations(words, 30, lib)
  assert.deepEqual(placed.map(p => p.path), ['marche.mp4', 'thanos.mp4'])
  assert.ok(Math.abs(placed[0].start - 2.8) < 0.01)
  assert.equal(placed[0].end - placed[0].start, 4)
  assert.equal(placed[0].source, 'https://example.com/marche')
  assert.equal(placed[1].end - placed[1].start, 3)
})

test('placeIllustrations respects guards, overlap, count and short clips', () => {
  const early = placeIllustrations([w('marche', 0.2)], 30, lib)
  assert.ok(early[0].start >= 1.5)
  const overlap = placeIllustrations([w('marche', 5), w('thanos', 6)], 30, lib, { minGapSec: 6 })
  assert.equal(overlap.length, 1)
  assert.equal(placeIllustrations([w('marche', 5), w('thanos', 20)], 30, lib, { maxCount: 1 }).length, 1)
  assert.equal(placeIllustrations([w('marche', 28)], 30, lib).length, 0)
  assert.equal(placeIllustrations([], 30, lib).length, 0)
})

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0

test('scanIllustrationFolder indexes videos with filename tags, sidecar source and real duration', { skip: !hasFfmpeg }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cw-ill-'))
  try {
    await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=blue:size=320x180:rate=10:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(dir, 'marche-legumes.mp4')], { lowPriority: false })
    writeFileSync(join(dir, 'marche-legumes.json'), JSON.stringify({ tags: ['primeur'], source: 'Auteur X / CC-BY' }))
    writeFileSync(join(dir, 'notes.txt'), 'ignore')
    const items = scanIllustrationFolder(dir)
    assert.equal(items.length, 1)
    assert.deepEqual(items[0].tags.sort(), ['legumes', 'marche', 'primeur'])
    assert.equal(items[0].source, 'Auteur X / CC-BY')
    assert.ok(items[0].durationSec > 1.5)
    assert.deepEqual(scanIllustrationFolder(join(dir, 'absent')), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

import { countTitleLines, fitTitle } from './assBuilder.ts'

test('fitTitle keeps whole words that fit in three lines and agrees with countTitleLines', () => {
  const hook = "Pense un super jeu tu choisis des pseudo et ensuite on verra bien ce qui se passe franchement"
  const fitted = fitTitle(hook, 3, 24)
  assert.ok(countTitleLines(fitted, 24) <= 3)
  assert.ok(hook.startsWith(fitted))
  assert.ok(fitted.split(' ').length >= 8)
  assert.equal(fitTitle('Court', 3, 24), 'Court')
  assert.equal(fitTitle('', 3, 24), '')
  assert.equal(countTitleLines('un deux trois quatre cinq six sept huit neuf dix onze douze', 12), 6)
})
