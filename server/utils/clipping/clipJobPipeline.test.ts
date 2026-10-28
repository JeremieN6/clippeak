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

test('renderJob reads a local source extract and shifts every time by its start (the plan stays in VOD time)', async () => {
  const ctx = { ...baseContext(), vodId: 'v1', momentId: 'm1' }
  const seen: string[][] = []
  const frames: Array<{ startSec: number, endSec: number, videoUrl: string }> = []
  const metrics = { width: 1080, height: 1920, videoSec: 12, audioSec: 12, freezeAtEndSec: 0, leadingSilenceSec: 0, trailingSilenceSec: 0 }
  const run = (getVideoSource?: PipelineDeps['getVideoSource']) => renderJob({ ...ctx, style: { ...ctx.style, framing: { ...ctx.style.framing, auto: true } }, photoPaths: ['p.png'] }, {
    getVideoUrl: async () => 'https://vod/index.m3u8',
    getVideoSource,
    detectFraming: async (input) => { frames.push(input); return null },
    runFfmpeg: async (args) => { seen.push(args); return '' },
    collectMetrics: async () => metrics,
    outputDir: tmpdir()
  }).catch(() => null)

  await run()
  const direct = seen.at(-1) as string[]
  await run(async () => ({ input: 'sources/v1/m1.mp4', baseSec: 10 }))
  const local = seen.at(-1) as string[]
  assert.equal(direct[direct.indexOf('-i') + 1], 'https://vod/index.m3u8')
  assert.equal(local[local.indexOf('-i') + 1], 'sources/v1/m1.mp4')
  // La recherche (-ss) recule du debut de l'extrait ; la duree lue ne change pas.
  assert.ok(Math.abs(Number(direct[direct.indexOf('-ss') + 1]) - Number(local[local.indexOf('-ss') + 1]) - 10) < 1e-6)
  assert.equal(direct[direct.indexOf('-t') + 1], local[local.indexOf('-t') + 1])
  // Le cadrage automatique regarde les memes images, decalees de la meme valeur.
  assert.ok(Math.abs(frames[0].startSec - frames[1].startSec - 10) < 1e-6)
  assert.ok(Math.abs(frames[0].endSec - frames[1].endSec - 10) < 1e-6)
  assert.equal(frames[1].videoUrl, 'sources/v1/m1.mp4')
})
