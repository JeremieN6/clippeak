import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadEnvFile, parseEnvText } from './loadEnvFile.ts'

const sample = [
  '# commentaire',
  'WHISPER_PYTHON=/srv/saas/clippeak/.venv/bin/python',
  'WHISPER_MODEL="small"',
  "CLIPPEAK_DATA_DIR='/srv/saas/clippeak-data'",
  'export WORKER_POLL_SEC=30',
  'ADMIN_PASSWORD=secret-admin',
  'SMTP_PASS=secret-smtp',
  'SSH_PRIVATE_KEY=-----BEGIN OPENSSH PRIVATE KEY-----',
  'b3BlbnNzaC1rZXktdjEAAAAABG5vbmU',
  '-----END OPENSSH PRIVATE KEY-----',
  'RENDER_THREADS=',
  'ANTHROPIC_API_KEY=cle-de-test',
  'pas une variable',
  ''
].join('\r\n')

test('parseEnvText reads simple variables, strips quotes and skips private key blocks', () => {
  const values = parseEnvText(sample)
  assert.equal(values.WHISPER_PYTHON, '/srv/saas/clippeak/.venv/bin/python')
  assert.equal(values.WHISPER_MODEL, 'small')
  assert.equal(values.CLIPPEAK_DATA_DIR, '/srv/saas/clippeak-data')
  assert.equal(values.WORKER_POLL_SEC, '30')
  assert.equal('SSH_PRIVATE_KEY' in values, false)
  assert.equal('b3BlbnNzaC1rZXktdjEAAAAABG5vbmU' in values, false)
})

test('loadEnvFile loads only the worker allowlist, never overrides, ignores empty values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cw-env-'))
  try {
    const file = join(dir, '.env.local')
    writeFileSync(file, sample)
    const env: Record<string, string | undefined> = { WHISPER_MODEL: 'base' }
    const loaded = loadEnvFile(file, env)
    assert.deepEqual(loaded.sort(), ['ANTHROPIC_API_KEY', 'CLIPPEAK_DATA_DIR', 'WHISPER_PYTHON', 'WORKER_POLL_SEC'])
    assert.equal(env.WHISPER_MODEL, 'base')
    assert.equal(env.WHISPER_PYTHON, '/srv/saas/clippeak/.venv/bin/python')
    for (const secret of ['ADMIN_PASSWORD', 'SMTP_PASS', 'SSH_PRIVATE_KEY', 'RENDER_THREADS']) assert.equal(env[secret], undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loadEnvFile is harmless when the file is missing or unreadable', () => {
  assert.deepEqual(loadEnvFile(join(tmpdir(), 'cw-absent', '.env.local'), {}), [])
})
