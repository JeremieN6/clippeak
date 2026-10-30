import test from 'node:test'
import assert from 'node:assert/strict'
import { isExpiredRefusedClip } from './retention.ts'

const now = new Date('2026-11-20T10:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 3600_000)

test('la video d un clip refuse ou en echec est supprimee apres 14 jours', () => {
  assert.equal(isExpiredRefusedClip({ status: 'rejected', outputPath: 'clips/a.mp4', updatedAt: daysAgo(15) }, now), true)
  assert.equal(isExpiredRefusedClip({ status: 'failed', outputPath: 'clips/a.mp4', updatedAt: daysAgo(14) }, now), true)
  assert.equal(isExpiredRefusedClip({ status: 'rejected', outputPath: 'clips/a.mp4', updatedAt: daysAgo(13) }, now), false)
})

test('un clip a valider, approuve ou sans fichier n est jamais touche', () => {
  for (const status of ['review', 'approved', 'queued', 'rendering']) assert.equal(isExpiredRefusedClip({ status, outputPath: 'clips/a.mp4', updatedAt: daysAgo(400) }, now), false)
  assert.equal(isExpiredRefusedClip({ status: 'rejected', outputPath: null, updatedAt: daysAgo(400) }, now), false)
})
