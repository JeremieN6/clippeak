import test from 'node:test'
import assert from 'node:assert/strict'
import { batchNotes } from './bellBatches.ts'

test('un lot est pret quand plus aucun clip n est en file ni en rendu et qu au moins un attend la validation', () => {
  const rows = [
    { channelId: 'A', batch: 1, status: 'review' }, { channelId: 'A', batch: 1, status: 'failed' },
    { channelId: 'A', batch: 2, status: 'review' }, { channelId: 'A', batch: 2, status: 'rendering' },
    { channelId: 'B', batch: 1, status: 'failed' }, { channelId: 'B', batch: 3, status: 'review' }, { channelId: 'B', batch: 3, status: 'approved' }
  ]
  assert.deepEqual(batchNotes(rows), [{ channelId: 'A', batch: 1, ready: 1 }, { channelId: 'B', batch: 3, ready: 1 }])
})

test('deux chaines avec le meme numero de lot ne se melangent pas', () => {
  const r = batchNotes([{ channelId: 'A', batch: 1, status: 'queued' }, { channelId: 'B', batch: 1, status: 'review' }])
  assert.deepEqual(r, [{ channelId: 'B', batch: 1, ready: 1 }])
})
