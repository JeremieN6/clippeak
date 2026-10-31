import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseStyle } from './streamerStyle.ts'
import {
  applySound, applySplitPreset, applySubtitlePreset, applyTitlePreset, applyVolumePreset, applyZoomPreset, asksAccentColor,
  soundOf, splitPresetOf, subtitlePresetOf, titlePresetOf, volumePresetOf, zoomPresetOf
} from './lookPresets.ts'

const fresh = () => parseStyle({}) as any

test('titre : chaque preset s applique, se relit, et reste dans les bornes du style', () => {
  for (const p of ['big', 'mid', 'small', 'none'] as const) {
    const s = fresh()
    applyTitlePreset(s, p)
    assert.equal(titlePresetOf(s), p)
    assert.doesNotThrow(() => parseStyle(s), p) // jamais un style refuse par la validation du serveur
  }
  const s = fresh(); applyTitlePreset(s, 'big')
  assert.deepEqual([s.title.enabled, s.title.fontSize, s.title.maxLines], [true, 90, 2])
  s.title.fontSize = 77 // reglage a la main : plus un preset
  assert.equal(titlePresetOf(s), null)
})

test('titre : ne touche ni a la police ni aux sous-titres', () => {
  const s = fresh(); const before = JSON.stringify({ f: s.title.fontName, sub: s.subtitles, z: s.zoomIntro })
  applyTitlePreset(s, 'big')
  assert.equal(JSON.stringify({ f: s.title.fontName, sub: s.subtitles, z: s.zoomIntro }), before)
})

test('sous-titres : avec couleur, sans couleur, aucun ; la question de couleur suit', () => {
  const s = fresh()
  applySubtitlePreset(s, 'color'); assert.equal(subtitlePresetOf(s), 'color'); assert.equal(asksAccentColor(s), true)
  applySubtitlePreset(s, 'plain'); assert.equal(subtitlePresetOf(s), 'plain'); assert.equal(asksAccentColor(s), false)
  applySubtitlePreset(s, 'none'); assert.equal(subtitlePresetOf(s), 'none'); assert.equal(asksAccentColor(s), false)
  s.subtitles.enabled = true; s.subtitles.autoEmphasis = 'high'
  assert.equal(subtitlePresetOf(s), null) // « fort » reste possible dans les reglages detailles
  assert.doesNotThrow(() => parseStyle(s))
})

test('zoom d ouverture : marque, leger, aucun ; valeurs dans 0..0,4', () => {
  for (const p of ['strong', 'light', 'none'] as const) {
    const s = fresh(); applyZoomPreset(s, p)
    assert.equal(zoomPresetOf(s), p)
    assert.doesNotThrow(() => parseStyle(s))
  }
  const s = fresh(); applyZoomPreset(s, 'strong'); s.zoomIntro.amount = 0.3
  assert.equal(zoomPresetOf(s), null)
})

test('ecran partage : auto par defaut, off sinon', () => {
  const s = fresh()
  assert.equal(splitPresetOf(s), 'auto')
  applySplitPreset(s, 'off'); assert.equal(splitPresetOf(s), 'off')
  applySplitPreset(s, 'auto'); assert.equal(splitPresetOf(s), 'auto')
  assert.doesNotThrow(() => parseStyle(s))
})

test('sons : choisir un son allume la situation et l interrupteur general ; tout couper l eteint', () => {
  const s = fresh()
  s.sfx.enabled = false; for (const k of ['intro', 'illustration', 'avatar']) s.sfx[k].enabled = false
  applySound(s, 'intro', 'whoosh')
  assert.deepEqual([s.sfx.enabled, s.sfx.intro.enabled, s.sfx.intro.sound, soundOf(s, 'intro')], [true, true, 'whoosh', 'whoosh'])
  assert.equal(soundOf(s, 'avatar'), 'none')
  applySound(s, 'avatar', 'pop')
  applySound(s, 'intro', 'none')
  assert.equal(s.sfx.enabled, true) // il reste le son de l avatar
  applySound(s, 'avatar', 'none')
  assert.equal(s.sfx.enabled, false)
  assert.equal(soundOf(s, 'intro'), 'none')
  applySound(s, 'intro', 'asset:00000000-0000-0000-0000-000000000001') // un son du streamer
  assert.equal(soundOf(s, 'intro'), 'asset:00000000-0000-0000-0000-000000000001')
  assert.doesNotThrow(() => parseStyle(s))
})

test('volume : trois niveaux dans 0..1', () => {
  const s = fresh()
  for (const p of ['soft', 'normal', 'loud'] as const) { applyVolumePreset(s, p); assert.equal(volumePresetOf(s), p) }
  s.sfx.volume = 0.45
  assert.equal(volumePresetOf(s), null)
  assert.doesNotThrow(() => parseStyle(s))
})
