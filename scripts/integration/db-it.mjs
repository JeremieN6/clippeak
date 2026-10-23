// Test d'integration des stores Prisma contre un Postgres jetable (PGlite) ou toutes les migrations sont rejouees.
// Usage : npm i --no-save @electric-sql/pglite @electric-sql/pglite-socket && node scripts/integration/db-it.mjs
// Rien n'est ecrit sur Neon : la base vit en memoire le temps du test.
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const port = 54331
const work = mkdtempSync(join(tmpdir(), 'clippeak-dbit-'))

const db = await PGlite.create()
const migrations = join(root, 'prisma', 'migrations')
for (const name of readdirSync(migrations).filter(n => /^\d+_/.test(n)).sort()) {
  await db.exec(readFileSync(join(migrations, name, 'migration.sql'), 'utf8').replace(/^﻿/, ''))
}
const socket = new PGLiteSocketServer({ db, port, host: '127.0.0.1' })
await socket.start()

// Le bundle est ecrit dans .output (ignore par git) pour que @prisma/client se resolve depuis le depot.
const outfile = join(root, '.output', 'it', 'db-it.cjs')
await build({ entryPoints: [join(root, 'scripts', 'integration', 'db-it.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['@prisma/client'], outfile, logLevel: 'error' })

const child = spawn('node', [outfile], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?connection_limit=1&sslmode=disable`, CLIPPEAK_DATA_DIR: join(work, 'data') }
})
const code = await new Promise(resolveExit => child.on('exit', resolveExit))
await socket.stop().catch(() => {})
await db.close().catch(() => {})
rmSync(work, { recursive: true, force: true })
process.exit(code ?? 1)
