import test from 'node:test'
import assert from 'node:assert/strict'
import { joinCaption, normalizeHashtags, splitCaption } from './captionParts.ts'
import { buildCaption } from './caption.ts'

test('splitCaption puts the last paragraph of hashtags in its own field', () => {
  assert.deepEqual(splitCaption('Mon saut raté\n\n#twitch #football'), { text: 'Mon saut raté', hashtags: '#twitch #football' })
  assert.deepEqual(splitCaption('Ligne 1\n\nLigne 2\n\n#a #b'), { text: 'Ligne 1\n\nLigne 2', hashtags: '#a #b' })
  assert.deepEqual(splitCaption('Pas de hashtags ici'), { text: 'Pas de hashtags ici', hashtags: '' })
  assert.deepEqual(splitCaption('Texte avec #un hashtag dedans\n\nEt une fin'), { text: 'Texte avec #un hashtag dedans\n\nEt une fin', hashtags: '' })
  assert.deepEqual(splitCaption(null), { text: '', hashtags: '' })
  assert.deepEqual(splitCaption('Titre\r\n\r\n#été #café'), { text: 'Titre', hashtags: '#été #café' })
})

test('normalizeHashtags accepts words, commas and missing #, and drops duplicates and symbols', () => {
  assert.equal(normalizeHashtags('twitch, #Football  foot!ball ##twitch'), '#twitch #Football')
  assert.equal(normalizeHashtags('mon-tag, autre_tag'), '#montag #autre_tag')
  assert.equal(normalizeHashtags('  '), '')
  assert.equal(normalizeHashtags('#a #A'), '#a')
})

test('joinCaption puts the text, a blank line and the hashtags back together, and round-trips a generated caption', () => {
  assert.equal(joinCaption('Mon texte', 'a b'), 'Mon texte\n\n#a #b')
  assert.equal(joinCaption('Mon texte', ''), 'Mon texte')
  assert.equal(joinCaption('', '#a'), '#a')
  const generated = buildCaption({ title: 'Il rate son saut', hook: 'la salle explose', channelName: 'Yass', category: 'humour', streamerTags: ['twitch'] })
  const parts = splitCaption(generated.caption)
  assert.equal(joinCaption(parts.text, parts.hashtags), generated.caption)
  assert.ok(parts.hashtags.includes('#twitch'))
})
