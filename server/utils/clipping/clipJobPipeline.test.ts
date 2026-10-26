import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { defaultTitle, QcFailedError, renderJob } from './clipJobPipeline.ts'
import type { JobContext, PipelineDeps } from './clipJobPipeline.ts'
import { collectClipMetrics } from './clipQc.ts'
import { runFfmpeg } from './ffmpegRunner.ts'
import { defaultStyle, parseStyle, resolveStyle, styleSchema } from './streamerStyle.ts'

const words = (list: string[], from: number, step = 0.45) => list.map((text, i) => ({ text, start: from + i * step, end: from + i * step + 0.35 }))

function baseContext(): JobContext {
  const w = [
    ...words(['Alors', 'hier', 'je', 'suis', 'alle', 'au', 'marche.'], 20),
    ...words(['Et', 'le', 'mec', 'me', 'dit', 'rien', 'du', 'tout', 'mdr.'], 24),
    ...words(['Bref', 'voila', 'quoi.'], 40)
  ]
  return {
    jobId: 'job-1', channelName: 'Streamer', vodTwitchId: '123', peakSec: 29,
    transcript: [{ start: 20, end: 41, text: w.map(x => x.text).join(' '), words: w }],
    hook: 'Alors hier je suis alle au marche', category: 'general', title: null, plan: null,
    settings: { keywords: ['mdr'], clipMinSec: 8, clipMaxSec: 25, subtitles: true, accentColor: '#FFFFFF', highlightColor: '#FFD400' },
    style: defaultStyle(), assets: {}, library: []
  }
}

test('style: defaults fill every field, bad values are rejected, and resolveStyle merges base settings', () => {
  const style = defaultStyle()
  assert.equal(style.title.maxLines, 3)
  assert.equal(style.zoomIntro.enabled, true)
  assert.throws(() => parseStyle({ title: { color: 'rouge' } }))
  assert.throws(() => parseStyle({ framing: { centerX: 2 } }))
  assert.throws(() => parseStyle({ title: { fontName: 'Lato; rm -rf' } }))
  assert.equal(styleSchema.safeParse({ overlay: { assetId: 'pas-un-uuid' } }).success, false)

  const resolved = resolveStyle(parseStyle({ subtitles: { keywords: ['Thanos'] }, overlay: { enabled: true, assetId: null, appear: 'outro' } }),
    { accentColor: '#00FF00', highlightColor: '#FF0000', subtitles: true, keywords: ['mdr'] }, { overlayPath: '/a/logo.gif', overlayAnimated: true }, 30)
  assert.equal(resolved.title.color, '#00FF00')
  assert.deepEqual(resolved.subtitles.keywords, ['Thanos'])
  assert.equal(resolved.subtitles.highlightColor, '#FF0000')
  assert.deepEqual(resolved.render.overlay?.windows, [{ start: 27, end: 30 }])
  // sans fichier d'avatar, pas d'overlay meme si active
  assert.equal(resolveStyle(parseStyle({ overlay: { enabled: true } }), { accentColor: '', highlightColor: '', subtitles: true, keywords: [] }, {}, 30).render.overlay, undefined)
  // sous-titres coupes dans les reglages de base
  assert.equal(resolveStyle(defaultStyle(), { accentColor: '', highlightColor: '', subtitles: false, keywords: [] }, {}, 30).subtitles.enabled, false)
})

test('defaultTitle capitalizes the hook and keeps it to three lines', () => {
  assert.equal(defaultTitle('alors hier je suis alle au marche', null), 'Alors hier je suis alle au marche')
  assert.equal(defaultTitle(null, { hook: 'une phrase' }), 'Une phrase')
})

test('renderJob refuses to send a clip that fails quality control', async () => {
  const deps: PipelineDeps = {
    getVideoUrl: async () => 'x.mp4',
    runFfmpeg: async () => '',
    collectMetrics: async () => ({ width: 1080, height: 1920, videoSec: 12, audioSec: 12, freezeAtEndSec: 10, leadingSilenceSec: 0, trailingSilenceSec: 0 }),
    outputDir: mkdtempSync(join(tmpdir(), 'cw-out-'))
  }
  try {
    await assert.rejects(renderJob(baseContext(), deps), (e: any) => e instanceof QcFailedError && e.report.issues.some((i: any) => i.code === 'frozen_end'))
  } finally {
    rmSync(deps.outputDir, { recursive: true, force: true })
  }
})

test('renderJob fails clearly on an empty transcript', async () => {
  const ctx = { ...baseContext(), transcript: [] }
  await assert.rejects(renderJob(ctx, { getVideoUrl: async () => '', runFfmpeg: async () => '', collectMetrics: async () => ({} as any), outputDir: tmpdir() }), /Transcription vide/)
})

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0

test('real ffmpeg: renderJob produces a clean vertical clip, passes QC and builds caption and title', { skip: !hasFfmpeg }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cw-job-'))
  try {
    const source = join(dir, 'vod.mp4')
    await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=60', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=60',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source], { lowPriority: false })
    const result = await renderJob(baseContext(), {
      getVideoUrl: async () => resolve(source),
      runFfmpeg: (args, options) => runFfmpeg(args, { ...options, lowPriority: false }),
      collectMetrics: path => collectClipMetrics(path, { lowPriority: false }),
      outputDir: join(dir, 'out')
    })
    assert.ok(existsSync(result.outputPath))
    assert.equal(result.qc.passed, true)
    assert.equal(result.title, 'Alors hier je suis alle au marche')
    assert.match(result.caption, /#streamer/)
    assert.ok(result.plan.keepRanges.length >= 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('renderJob stops before rendering when there is not enough speech for the minimum length', async () => {
  let rendered = false
  const ctx = baseContext()
  ctx.settings.clipMinSec = 60
  ctx.settings.clipMaxSec = 90
  await assert.rejects(
    renderJob(ctx, { getVideoUrl: async () => 'x', runFfmpeg: async () => { rendered = true; return '' }, collectMetrics: async () => ({} as any), outputDir: tmpdir() }),
    /Pas assez de parole/
  )
  assert.equal(rendered, false)
})
