import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const module = pathToFileURL(resolve('server/utils/clipping/dataDir.ts')).href

// Chaque cas tourne dans son propre processus : le dossier est memorise une fois par processus.
function run(cwd: string, env: Record<string, string | undefined>): string {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '-e', `import('${module}').then(m => process.stdout.write(m.dataDir()))`], { cwd, encoding: 'utf8', env: { ...process.env, CLIPPEAK_DATA_DIR: undefined, ...env } as NodeJS.ProcessEnv })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

test('dataDir: the process environment wins, then .env.local (the site does not load it), then ./data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clippeak-datadir-'))
  assert.equal(run(dir, {}), join(dir, 'data'))
  writeFileSync(join(dir, '.env.local'), 'AUTRE=1\nCLIPPEAK_DATA_DIR=/srv/donnees-du-fichier\n')
  assert.equal(run(dir, {}), resolve('/srv/donnees-du-fichier'))
  assert.equal(run(dir, { CLIPPEAK_DATA_DIR: '/srv/donnees-du-processus' }), resolve('/srv/donnees-du-processus'))
})
