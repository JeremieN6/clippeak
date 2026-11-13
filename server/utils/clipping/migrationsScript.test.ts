import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Le script qui applique les migrations au deploiement (scripts/ops/migrations.sh). Un faux « prisma » joue les reponses de la base.
const hasBash = spawnSync('bash', ['--version']).status === 0
const script = resolve('scripts/ops/migrations.sh')
const toBashPath = (p: string) => p.replace(/\\/g, '/')

const FAKE = `#!/bin/bash
# faux prisma : « migrate status » rend le contenu de $FAKE_STATUS, « migrate deploy » note son appel dans $FAKE_LOG.
if [ "$1 $2" = "migrate status" ]; then cat "$FAKE_STATUS"; exit 0; fi
if [ "$1 $2" = "migrate deploy" ]; then echo deploy >> "$FAKE_LOG"; echo "Applying migration"; exit "\${FAKE_DEPLOY_RC:-0}"; fi
exit 1
`

const UP_TO_DATE = 'Database schema is up to date!'
const pending = (...names: string[]) => `Following migrations have not yet been applied:\n${names.join('\n')}\n\nTo apply migrations in development run prisma migrate dev.`

async function run(status: string, env: Record<string, string> = {}, mode = 'auto') {
  const dir = await mkdtemp(join(tmpdir(), 'mig-test-'))
  try {
    await writeFile(join(dir, 'fake.sh'), FAKE)
    await writeFile(join(dir, 'status.txt'), status)
    const result = spawnSync('bash', [toBashPath(script), mode], {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: 'postgresql://x:y@db-pooler.test/z', CLIPPEAK_PRISMA: `bash ${toBashPath(join(dir, 'fake.sh'))}`, FAKE_STATUS: toBashPath(join(dir, 'status.txt')), FAKE_LOG: toBashPath(join(dir, 'log.txt')), ...env }
    })
    const log = existsSync(join(dir, 'log.txt')) ? await readFile(join(dir, 'log.txt'), 'utf8') : ''
    return { code: result.status, out: result.stdout + result.stderr, deployed: log.includes('deploy') }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('migrations auto: nothing pending means nothing applied', { skip: !hasBash }, async () => {
  const r = await run(UP_TO_DATE)
  assert.equal(r.code, 0)
  assert.equal(r.deployed, false)
})

test('migrations auto: an additive migration is applied by itself', { skip: !hasBash }, async () => {
  const r = await run(pending('202611131000_extraits_longs', '202611131500_extraits_longs_verifiee'))
  assert.equal(r.code, 0, r.out)
  assert.equal(r.deployed, true)
  assert.match(r.out, /application automatique/)
})

test('migrations auto: a migration that drops a column stops the deploy and is never applied', { skip: !hasBash }, async () => {
  const r = await run(pending('202611131000_extraits_longs', '202607020001_remove_zip_par_mail'))
  assert.equal(r.code, 4)
  assert.equal(r.deployed, false)
  assert.match(r.out, /STOP/)
  assert.match(r.out, /migrations\.sh apply/)
})

test('migrations auto: a failed application fails the deploy, an unreadable state is only a warning (code 2)', { skip: !hasBash }, async () => {
  const failed = await run(pending('202611131000_extraits_longs'), { FAKE_DEPLOY_RC: '1' })
  assert.equal(failed.code, 1)
  assert.equal(failed.deployed, true)
  const unknown = await run('Error: P1001 cannot reach the database')
  assert.equal(unknown.code, 2)
  assert.equal(unknown.deployed, false)
})

test('migrations scan: flags drops, deletes and renames but not foreign keys with ON DELETE CASCADE or comments', { skip: !hasBash }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mig-scan-'))
  try {
    const safe = join(dir, 'safe.sql')
    const bad = join(dir, 'bad.sql')
    await writeFile(safe, '-- on supprime rien : DROP dans un commentaire\nCREATE TABLE "a" ("id" TEXT);\nALTER TABLE "a" ADD CONSTRAINT "fk" FOREIGN KEY ("b") REFERENCES "b"("id") ON DELETE CASCADE ON UPDATE CASCADE;\nALTER TABLE "a" ADD COLUMN "updated_at" TIMESTAMP;\n')
    await writeFile(bad, 'ALTER TABLE "a" RENAME COLUMN "x" TO "y";\n')
    const ok = spawnSync('bash', [toBashPath(script), 'scan', toBashPath(safe)], { encoding: 'utf8' })
    assert.equal(ok.status, 0, ok.stdout)
    const flagged = spawnSync('bash', [toBashPath(script), 'scan', toBashPath(safe), toBashPath(bad)], { encoding: 'utf8' })
    assert.equal(flagged.status, 4)
    assert.match(flagged.stdout, /RENAME/)
    for (const sql of ['DROP TABLE "a";', 'DELETE FROM "a";', 'TRUNCATE "a";', 'UPDATE "a" SET "x" = 1;', 'ALTER TABLE "a" ALTER COLUMN "x" TYPE TEXT;']) {
      await writeFile(bad, sql + '\n')
      assert.equal(spawnSync('bash', [toBashPath(script), 'scan', toBashPath(bad)], { encoding: 'utf8' }).status, 4, sql)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
