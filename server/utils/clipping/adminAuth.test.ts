import test from 'node:test'
import assert from 'node:assert/strict'
import { createRateLimiter, parseRange, safeEqual, signMediaToken, verifyMediaToken } from './adminAuth.ts'
import { ASSET_RULES, safeFilename, safeResolve } from './dataDir.ts'

test('safeEqual compares strings of any length without throwing', () => {
  assert.equal(safeEqual('secret', 'secret'), true)
  assert.equal(safeEqual('secret', 'secreT'), false)
  assert.equal(safeEqual('secret', 'secret2'), false)
  assert.equal(safeEqual('', ''), true)
})

test('rate limiter blocks after the maximum number of attempts and recovers after the window', () => {
  let now = 0
  const limiter = createRateLimiter(3, 1000, () => now)
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.attempt('ip')), [true, true, true, false])
  assert.equal(limiter.attempt('autre'), true)
  now = 1500
  assert.equal(limiter.attempt('ip'), true)
  limiter.reset('ip')
  assert.equal(limiter.attempt('ip'), true)
})

test('media tokens are bound to the resource, expire and cannot be tampered with', () => {
  const token = signMediaToken('s3cret', 'job-1', 10_000)
  assert.equal(verifyMediaToken('s3cret', 'job-1', token, 5_000), true)
  assert.equal(verifyMediaToken('s3cret', 'job-2', token, 5_000), false)
  assert.equal(verifyMediaToken('autre', 'job-1', token, 5_000), false)
  assert.equal(verifyMediaToken('s3cret', 'job-1', token, 10_001), false)
  assert.equal(verifyMediaToken('s3cret', 'job-1', '10000.xxxx', 5_000), false)
  assert.equal(verifyMediaToken('s3cret', 'job-1', 'n-importe-quoi', 5_000), false)
  assert.equal(JSON.stringify(token).includes('s3cret'), false)
})

test('parseRange handles open, suffix, bounded and invalid ranges', () => {
  assert.equal(parseRange(undefined, 100), null)
  assert.deepEqual(parseRange('bytes=0-9', 100), { start: 0, end: 9 })
  assert.deepEqual(parseRange('bytes=50-', 100), { start: 50, end: 99 })
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 })
  assert.deepEqual(parseRange('bytes=90-500', 100), { start: 90, end: 99 })
  assert.equal(parseRange('bytes=100-120', 100), 'invalid')
  assert.equal(parseRange('bytes=9-1', 100), 'invalid')
  assert.equal(parseRange('items=0-1', 100), 'invalid')
  assert.equal(parseRange('bytes=-', 100), 'invalid')
})

test('safeResolve refuses path traversal and absolute escapes', () => {
  assert.ok(safeResolve('/srv/data', 'clips/a.mp4').endsWith('a.mp4'))
  assert.throws(() => safeResolve('/srv/data', '../etc/passwd'))
  assert.throws(() => safeResolve('/srv/data', 'clips/../../x'))
  assert.throws(() => safeResolve('/srv/data', ''))
  assert.throws(() => safeResolve('/srv/data', 'a\0b'))
  assert.throws(() => safeResolve('/srv/data', process.platform === 'win32' ? 'C:\\Windows\\system32' : '/etc/passwd'))
})

test('safeFilename keeps a safe basename and asset rules cover every kind', () => {
  assert.equal(safeFilename('../../Mon logo é!.GIF'), 'Mon_logo_e_.GIF')
  assert.equal(safeFilename('..'), 'fichier')
  assert.equal(safeFilename('a/b\\c.mp4'), 'c.mp4')
  for (const kind of ['photo', 'avatar', 'sfx', 'illustration'] as const) assert.ok(ASSET_RULES[kind].maxBytes > 0)
})

import { contentMatchesExtension, validateUpload } from './assetValidation.ts'

test('upload validation checks extension, size and magic bytes', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47]), Buffer.alloc(100)])
  assert.deepEqual(validateUpload('photo', 'moi.PNG', png), { ok: true, extension: '.png' })
  assert.equal(validateUpload('photo', 'moi.exe', png).ok, false)
  assert.equal(validateUpload('photo', 'moi.png', Buffer.alloc(0)).ok, false)
  assert.equal(validateUpload('photo', 'moi.png', Buffer.from('<?php echo 1; ?>')).ok, false)
  assert.equal(validateUpload('photo', 'moi.png', Buffer.alloc(9 * 1024 * 1024, 1)).ok, false)
  assert.equal(validateUpload('sfx', 'a.png', png).ok, false)
  assert.equal(contentMatchesExtension('.gif', Buffer.from('GIF89a....')), true)
  assert.equal(contentMatchesExtension('.mp4', Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom')])), true)
  assert.equal(contentMatchesExtension('.wav', Buffer.from('RIFF\0\0\0\0WAVEfmt ')), true)
  assert.equal(contentMatchesExtension('.zip', Buffer.from('PK')), false)
})

import { hasBlockingIssue, runPreflight } from './preflight.ts'

test('preflight blocks on a missing migration or ffmpeg and only warns about whisper', async () => {
  const ok = { missingSchema: async () => [], commandWorks: () => true, python: 'python3' }
  assert.deepEqual(await runPreflight(ok), [])

  const noMigration = await runPreflight({ ...ok, missingSchema: async () => ['moments.transcript'] })
  assert.equal(hasBlockingIssue(noMigration), true)
  assert.match(noMigration[0].message, /moments\.transcript/)

  const noFfmpeg = await runPreflight({ ...ok, commandWorks: command => command !== 'ffmpeg' })
  assert.equal(hasBlockingIssue(noFfmpeg), true)

  const noWhisper = await runPreflight({ ...ok, commandWorks: command => command !== 'python3' })
  assert.deepEqual(noWhisper.map(i => i.level), ['warning'])
  assert.equal(hasBlockingIssue(noWhisper), false)
})
