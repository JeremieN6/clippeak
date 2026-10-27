import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { availableFonts, FONT_CHOICES, isAvailableFont } from './fonts.ts'

test('only fonts whose file is present are offered (Lato is installed on the server)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cw-fonts-'))
  try {
    assert.deepEqual(availableFonts(dir).map(f => f.family), ['Lato'])
    writeFileSync(join(dir, 'Anton-Regular.ttf'), 'x')
    assert.deepEqual(availableFonts(dir).map(f => f.family), ['Lato', 'Anton'])
    assert.equal(isAvailableFont('Anton', dir), true)
    assert.equal(isAvailableFont('Montserrat', dir), false)
    assert.equal(isAvailableFont('../../etc/passwd', dir), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('every choice has a readable label and a note for the streamer', () => {
  for (const font of FONT_CHOICES) assert.ok(font.label && font.note && font.family)
})
