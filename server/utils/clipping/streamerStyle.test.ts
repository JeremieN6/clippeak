import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStyle, referencedSoundAssets, resolveStyle, styleSchema } from './streamerStyle.ts'
import { titleLayout } from './assBuilder.ts'

const ID = '11111111-1111-4111-8111-111111111111'
const settings = { accentColor: '#FFFFFF', highlightColor: '#FFD400', subtitles: true, keywords: [] }

test('defaults keep the wind sound at the start and nothing else', () => {
  const style = parseStyle({})
  assert.deepEqual(style.sfx.intro, { enabled: true, sound: 'wind' })
  assert.equal(style.sfx.illustration.enabled, false)
  assert.equal(style.sfx.avatar.enabled, false)
  const resolved = resolveStyle(style, settings, {}, 30)
  assert.deepEqual(resolved.render.sfx.rules, { intro: { builtin: 'wind' }, illustration: undefined, avatar: undefined })
})

test('the old single SFX file becomes the sound played at the start', () => {
  const style = parseStyle({ sfx: { enabled: true, volume: 0.4, assetId: ID } })
  assert.deepEqual(style.sfx.intro, { enabled: true, sound: `asset:${ID}` })
  assert.deepEqual(referencedSoundAssets(style), [ID])
  assert.deepEqual(resolveStyle(style, settings, { sfxPaths: { [ID]: '/d/vent.wav' } }, 30).render.sfx.rules.intro, { path: '/d/vent.wav' })
})

test('a deleted or foreign SFX file is skipped instead of failing the render; disabled situations play nothing', () => {
  const style = parseStyle({ sfx: { intro: { enabled: true, sound: `asset:${ID}` }, illustration: { enabled: true, sound: 'ding' }, avatar: { enabled: false, sound: 'pop' } } })
  const rules = resolveStyle(style, settings, { sfxPaths: {} }, 30).render.sfx.rules
  assert.equal(rules.intro, undefined)
  assert.deepEqual(rules.illustration, { builtin: 'ding' })
  assert.equal(rules.avatar, undefined)
})

test('unknown sounds are refused', () => {
  assert.equal(styleSchema.safeParse({ sfx: { intro: { enabled: true, sound: 'rm -rf' } } }).success, false)
  assert.equal(styleSchema.safeParse({ sfx: { intro: { enabled: true, sound: 'asset:../../etc' } } }).success, false)
  assert.equal(styleSchema.safeParse({ sfx: { avatar: { enabled: true, sound: 'impact' } } }).success, true)
})

test('title layout follows the font size: default size keeps 24 characters on 3 lines, bigger fonts hold less', () => {
  assert.deepEqual(titleLayout(68, 3), { maxCharsPerLine: 24, maxLines: 3 })
  const big = titleLayout(110, 3)
  assert.ok(big.maxCharsPerLine < 24 && big.maxLines < 3)
  assert.deepEqual(titleLayout(120, 3).maxLines, 1)
  const small = titleLayout(40, 3)
  assert.ok(small.maxCharsPerLine > 24)
  assert.equal(titleLayout(40, 2).maxLines, 2)
  const resolved = resolveStyle(parseStyle({ title: { fontSize: 100 } }), settings, {}, 30).title
  assert.deepEqual([resolved.maxCharsPerLine, resolved.maxLines], [titleLayout(100, 3).maxCharsPerLine, titleLayout(100, 3).maxLines])
})
