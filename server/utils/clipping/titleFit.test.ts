import test from 'node:test'
import assert from 'node:assert/strict'
import { fitTitleToBand, MIN_TITLE_FONT_SIZE } from './titleFit.ts'
import { countTitleLines } from './assBuilder.ts'

test('a title that fits keeps its text and the chosen font size', () => {
  const fitted = fitTitleToBand('Moi je suis un pirate, je suis de la vieille ecole.', 68, 3)
  assert.equal(fitted.text, 'Moi je suis un pirate, je suis de la vieille ecole.')
  assert.equal(fitted.fontSize, 68)
  assert.equal(fitted.shrunk, false)
  assert.equal(fitted.truncated, false)
})

test('the title of the real failure (4 lines at 68 px) now fits by shrinking the font, text untouched', () => {
  const raw = 'Moi je suis un pirate, je suis de la vieille ecole. (V2 - Ecran scinde)'
  assert.ok(countTitleLines(raw, 24) > 3)
  const fitted = fitTitleToBand(raw, 68, 3)
  assert.equal(fitted.text, raw)
  assert.equal(fitted.shrunk, true)
  assert.equal(fitted.truncated, false)
  assert.ok(fitted.fontSize < 68 && fitted.fontSize >= MIN_TITLE_FONT_SIZE)
  assert.ok(fitted.lines <= fitted.maxLines)
})

test('a title too long even for the smallest font is cut at a whole word with an ellipsis, never beyond the lines allowed', () => {
  const raw = Array.from({ length: 40 }, (_, i) => `mot${i}`).join(' ')
  const fitted = fitTitleToBand(raw, 68, 3)
  assert.equal(fitted.truncated, true)
  assert.equal(fitted.fontSize, MIN_TITLE_FONT_SIZE)
  assert.ok(fitted.text.endsWith('…'))
  assert.ok(fitted.lines <= fitted.maxLines)
  assert.ok(raw.startsWith(fitted.text.slice(0, -1).trim()))
})

test('fewer lines allowed, or a font already below the floor, are respected', () => {
  assert.ok(fitTitleToBand('Un titre assez long pour deux lignes seulement ici', 68, 1).lines <= 1)
  assert.equal(fitTitleToBand('Un titre tres tres long qui ne tient pas du tout sur une ligne avec cette police', 40, 1).fontSize, 40)
  assert.equal(fitTitleToBand('  ', 68, 3).text, '')
})
