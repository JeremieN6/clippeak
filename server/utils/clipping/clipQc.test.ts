import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkNames, collectClipMetrics, evaluateQc } from './clipQc.ts'
import type { ClipMetrics, QcExpectations } from './clipQc.ts'
import { buildCaption } from './caption.ts'
import { runFfmpeg } from './ffmpegRunner.ts'

const good: ClipMetrics = { width: 1080, height: 1920, videoSec: 40, audioSec: 40.05, freezeAtEndSec: null, leadingSilenceSec: 0.1, trailingSilenceSec: 0.2 }
const expect: QcExpectations = { minSec: 30, maxSec: 60, title: 'Un titre court et clair', titleMaxLines: 3, titleMaxCharsPerLine: 24, texts: ['salut a tous'], names: ['Yassencore'] }

test('a name that looks misspelled is a warning: it does not block the clip', () => {
  const report = evaluateQc(good, { ...expect, texts: ['Yassencor est la'] })
  assert.equal(report.passed, true)
  assert.deepEqual(report.issues.map(i => [i.severity, i.code]), [['warning', 'name']])
})

test('a clean clip passes every check', () => {
  const report = evaluateQc(good, expect)
  assert.equal(report.passed, true)
  assert.deepEqual(report.issues, [])
})

test('each defect is reported with its own code', () => {
  const bad = { ...good, width: 720, videoSec: 20, audioSec: 21, freezeAtEndSec: 18, leadingSilenceSec: 1.2, trailingSilenceSec: 2 }
  const codes = evaluateQc(bad, expect).issues.map(i => i.code)
  for (const code of ['resolution', 'duration', 'sync', 'frozen_end', 'leading_silence', 'trailing_silence']) assert.ok(codes.includes(code as any), code)
  assert.ok(evaluateQc({ ...good, audioSec: null }, expect).issues.some(i => i.code === 'no_audio'))
})

test('title problems are caught: empty, too many lines, invalid characters', () => {
  assert.ok(evaluateQc(good, { ...expect, title: '  ' }).issues.some(i => i.code === 'title'))
  assert.ok(evaluateQc(good, { ...expect, title: 'un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze' }).issues.some(i => i.code === 'title'))
  assert.ok(evaluateQc(good, { ...expect, title: 'Titre � casse' }).issues.some(i => i.code === 'title'))
})

test('checkNames flags near misses of the streamer dictionary but not exact spellings', () => {
  assert.equal(checkNames(['Yassencore est la'], ['Yassencore']).length, 0)
  const issues = checkNames(['Yassencor et Yasencore'], ['Yassencore'])
  assert.equal(issues.length, 2)
  assert.equal(checkNames(['bonjour tout le monde'], ['Yassencore']).length, 0)
})

test('buildCaption: streamer tags first, then clip tags, never the channel name nor generic tags', () => {
  const { caption, hashtags } = buildCaption({ title: 'Il a retrouve son pere', hook: 'Hier je suis alle au marche', channelName: 'Jeremie_F7', category: 'Just Chatting', streamerTags: ['#Team_F7', 'gaming', 'troisieme'] })
  assert.deepEqual(hashtags, ['#teamf7', '#gaming', '#justchatting', '#retrouve', '#marche'])
  // Le titre puis les hashtags : l'accroche n'est jamais affichee a cote d'un titre modifie.
  assert.equal(caption, 'Il a retrouve son pere\n\n#teamf7 #gaming #justchatting #retrouve #marche')
  for (const banned of ['#jeremief7', '#twitch', '#fyp', '#clip']) assert.ok(!hashtags.includes(banned), banned)
  assert.ok(!buildCaption({ title: 'Jeremief7 arrive', channelName: 'Jeremie_F7', category: 'general' }).hashtags.some(t => t === '#jeremief7' || t === '#general'))
  assert.ok(buildCaption({ title: 'Titre long avec plusieurs sujets differents ici', channelName: 'x', maxClipTags: 2 }).hashtags.length <= 2)
})

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0

test('real ffmpeg metrics detect leading silence and a frozen end', { skip: !hasFfmpeg }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cw-qc-'))
  try {
    // 3 s de silence puis un bip, image qui bouge 4 s puis figee 3 s (tpad clone la derniere image).
    await runFfmpeg([
      '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:rate=30:duration=4',
      '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono:d=3',
      '-f', 'lavfi', '-i', 'sine=frequency=500:duration=4',
      '-filter_complex', '[0:v]tpad=stop_mode=clone:stop_duration=3[v];[1:a][2:a]concat=n=2:v=0:a=1[a]',
      '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(dir, 'c.mp4')
    ], { lowPriority: false })
    const metrics = await collectClipMetrics(join(dir, 'c.mp4'), { lowPriority: false })
    assert.equal(metrics.width, 1080)
    assert.ok(metrics.leadingSilenceSec > 2.5, `silence debut ${metrics.leadingSilenceSec}`)
    assert.ok(metrics.freezeAtEndSec !== null && metrics.freezeAtEndSec > 3.5, `gel ${metrics.freezeAtEndSec}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
