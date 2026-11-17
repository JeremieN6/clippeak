import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectFraming, framingFromHits, framingShows, visibleArea } from './framingDetect.ts'
import { QcFailedError, renderJob } from './clipJobPipeline.ts'
import type { JobContext } from './clipJobPipeline.ts'
import { cropRect } from './clipRender.ts'
import { evaluateQc } from './clipQc.ts'
import { applyFramePreset, framePresetOf } from './lookPresets.ts'
import { defaultStyle, parseStyle } from './streamerStyle.ts'

const hit = (x: number, y: number, w: number, h: number, similarity = 0.7) => ({ found: true, similarity, box: { x, y, w, h } })
const miss = { found: false, similarity: 0.2 }
const words = (list: string[], from: number, step = 0.45) => list.map((text, i) => ({ text, start: from + i * step, end: from + i * step + 0.35 }))

function context(overrides: Partial<JobContext> = {}): JobContext {
  const w = [...words(['Alors', 'hier', 'je', 'suis', 'alle', 'au', 'marche.'], 20), ...words(['Et', 'le', 'mec', 'me', 'dit', 'rien', 'du', 'tout', 'mdr.'], 24)]
  return {
    jobId: 'j', channelName: 'Streamer', vodTwitchId: '1', peakSec: 29,
    transcript: [{ start: 20, end: 28, text: 'x', words: w }], hook: 'Alors hier je suis alle au marche', category: null, title: null, plan: null,
    settings: { keywords: [], clipMinSec: 8, clipMaxSec: 25, subtitles: true, accentColor: '#FFFFFF', highlightColor: '#FFD400' },
    style: defaultStyle(), assets: {}, library: [], photoPaths: ['/p/a.jpg'], ...overrides
  }
}
const goodMetrics = async () => ({ width: 1080, height: 1920, videoSec: 12, audioSec: 12, freezeAtEndSec: null, leadingSilenceSec: 0, trailingSilenceSec: 0 })

test('framingFromHits garde dans le cadre un streamer qui se penche, avec de la marge pour le zoom d ouverture', () => {
  // Le visage se deplace de 0,45 a 0,62 : un zoom x2 centre sur la mediane le laisserait sortir du cadre (cas du clip « visage coupe a droite »).
  const hits = [hit(0.45, 0.2, 0.1, 0.22), hit(0.5, 0.2, 0.1, 0.22), hit(0.55, 0.2, 0.1, 0.22), hit(0.62, 0.2, 0.1, 0.22), hit(0.5, 0.2, 0.1, 0.22)]
  const framing = framingFromHits(hits, { introAmount: 0.12 })!
  for (const h of hits) assert.ok(framingShows(framing, h.box, 16 / 9, 0.12), `visage en x=${h.box.x} visible`)
  assert.ok(framing.zoom < 2)
  // Le meme visage sortirait du cadre avec l'ancien calcul (zoom x2 sur la position mediane)
  assert.equal(framingShows({ centerX: 0.53, centerY: 0.3, zoom: 2 }, { x: 0.62, y: 0.2, w: 0.1, h: 0.22 }), false)
  assert.ok(visibleArea({ centerX: 0.5, centerY: 0.5, zoom: 1 }).w < 0.33)
})

test('le plan choisi (large, moyen, serre) change le zoom ; une image aberrante ne tire pas le cadrage', () => {
  const small = [hit(0.45, 0.3, 0.04, 0.08), hit(0.46, 0.3, 0.04, 0.08)]
  const wide = framingFromHits(small, { targetFaceShare: 0.16, maxZoom: 1.4 })!
  const close = framingFromHits(small, { targetFaceShare: 0.32, maxZoom: 2.4 })!
  assert.ok(wide.zoom <= 1.4 && close.zoom > wide.zoom)
  const odd = framingFromHits([hit(0.45, 0.2, 0.1, 0.22), hit(0.46, 0.2, 0.1, 0.22), hit(0.9, 0.8, 0.1, 0.22)])!
  assert.ok(odd.centerX < 0.6)
})

test('detectFraming regarde davantage d images avant de conclure que le streamer est absent', async () => {
  let calls = 0
  const result = await detectFraming({ videoUrl: 'v', startSec: 0, endSec: 30, photos: ['a'] }, {
    extractFrame: async () => {},
    locate: async (req) => { calls++; return { photos_used: 1, frames: req.frames.map(f => ({ t: f.t, ...(calls === 2 ? hit(0.4, 0.2, 0.2, 0.5) : miss) })) } },
    modelsDir: 'm', workDir: async () => 'w', cleanup: async () => {}
  })
  assert.equal(calls, 2)
  assert.ok(result)
})

test('REGLE PRIORITAIRE : un clip sans le streamer est refuse avant le rendu, en cadrage automatique comme manuel', async () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'cw-absent-'))
  try {
    for (const style of [parseStyle({ framing: { auto: true } }), parseStyle({ framing: { auto: false } })]) {
      let rendered = false
      const deps = { getVideoUrl: async () => 'v.m3u8', runFfmpeg: async () => { rendered = true; return '' }, collectMetrics: goodMetrics, outputDir, detectFraming: async () => null }
      await assert.rejects(renderJob(context({ style }), deps), (e: any) => e instanceof QcFailedError && !e.report.passed && e.report.issues.some((i: any) => i.code === 'streamer' && i.severity === 'error'))
      assert.equal(rendered, false)
    }
  } finally {
    rmSync(outputDir, { recursive: true, force: true })
  }
})

test('un cadrage manuel qui ne montre pas le streamer est remplace par celui de la reconnaissance ; un bon cadrage manuel est garde', async () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'cw-manual-'))
  try {
    const seen: string[] = []
    const run = (detected: any) => renderJob(context({ style: parseStyle({ framing: { auto: false, centerX: 0.5, centerY: 0.5, zoom: 1 } }) }), {
      getVideoUrl: async () => 'v.m3u8', runFfmpeg: async (args: string[]) => { seen.push(args.join(' ')); return '' }, collectMetrics: goodMetrics, outputDir, detectFraming: async () => detected
    })
    const away = { centerX: 0.8, centerY: 0.4, zoom: 1.5, face: { x: 0.7, y: 0.2, w: 0.2, h: 0.4 } }
    const replaced = await run(away)
    const expected = cropRect(1280, 720, away)
    assert.ok(seen[0].includes(`crop=${expected.w}:${expected.h}:${expected.x}:${expected.y}`))
    assert.ok(replaced.qc.issues.some(i => i.code === 'framing' && /manuel/.test(i.message)))

    const centred = await run({ centerX: 0.5, centerY: 0.5, zoom: 1, face: { x: 0.45, y: 0.2, w: 0.1, h: 0.4 } })
    const manual = cropRect(1280, 720, { centerX: 0.5, centerY: 0.5, zoom: 1 })
    assert.ok(seen[1].includes(`crop=${manual.w}:${manual.h}:${manual.x}:${manual.y}`))
    assert.equal(centred.qc.issues.some(i => i.code === 'framing'), false)
  } finally {
    rmSync(outputDir, { recursive: true, force: true })
  }
})

test('si la reconnaissance du visage plante, le clip passe avec un avertissement (une panne ne bloque pas tout)', async () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'cw-down-'))
  try {
    const r = await renderJob(context(), { getVideoUrl: async () => 'v', runFfmpeg: async () => '', collectMetrics: goodMetrics, outputDir, detectFraming: async () => { throw new Error('python absent') } })
    assert.equal(r.qc.passed, true)
    assert.equal(r.qc.issues.find(i => i.code === 'streamer')?.severity, 'warning')
  } finally {
    rmSync(outputDir, { recursive: true, force: true })
  }
})

test('sans photo, le clip passe avec un avertissement : on ne peut pas verifier', async () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'cw-nophoto-'))
  try {
    const r = await renderJob(context({ photoPaths: [] }), { getVideoUrl: async () => 'v', runFfmpeg: async () => '', collectMetrics: goodMetrics, outputDir })
    assert.equal(r.qc.passed, true)
    assert.equal(r.qc.issues.find(i => i.code === 'streamer')?.severity, 'warning')
  } finally {
    rmSync(outputDir, { recursive: true, force: true })
  }
})

test('evaluateQc : streamer absent = erreur, verification impossible = avertissement', () => {
  const metrics = { width: 1080, height: 1920, videoSec: 12, audioSec: 12, freezeAtEndSec: null, leadingSilenceSec: 0, trailingSilenceSec: 0 }
  const expect = { minSec: 8, maxSec: 25, title: 'Un titre', titleMaxLines: 3, titleMaxCharsPerLine: 24, texts: [], names: [] }
  assert.equal(evaluateQc(metrics, expect).passed, true)
  assert.equal(evaluateQc(metrics, { ...expect, streamer: 'absent' }).passed, false)
  const unknown = evaluateQc(metrics, { ...expect, streamer: 'unknown' })
  assert.equal(unknown.passed, true)
  assert.equal(unknown.issues.find(i => i.code === 'streamer')?.severity, 'warning')
})

test('plan du cadrage : moyen par defaut, large et serre acceptes par le schema', () => {
  const s: any = defaultStyle()
  assert.equal(framePresetOf(s), 'normal')
  for (const p of ['wide', 'close', 'normal'] as const) { applyFramePreset(s, p); assert.equal(framePresetOf(s), p); assert.equal(parseStyle(s).framing.autoZoom, p) }
})
