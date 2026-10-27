import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildTimeline } from './timeline.ts'
import { buildAss, hexToAss, normalizeWord, wrapTitle } from './assBuilder.ts'
import { buildRenderArgs, cropRect, DEFAULT_RENDER_STYLE, sfxEvents } from './clipRender.ts'
import { BUILTIN_SOUNDS } from './sounds.ts'
import { mergeWordFragments } from './whisperTranscribe.ts'
import { planCut } from './cutPlanner.ts'
import { runFfmpeg } from './ffmpegRunner.ts'

test('timeline maps VOD time to clip time across removed silences', () => {
  const tl = buildTimeline([{ start: 100, end: 105 }, { start: 110, end: 112 }])
  assert.equal(tl.totalSec, 7)
  assert.equal(tl.toClipTime(100), 0)
  assert.equal(tl.toClipTime(104), 4)
  assert.equal(tl.toClipTime(108), 5)
  assert.equal(tl.toClipTime(111), 6)
  assert.equal(tl.toClipTime(500), 7)
})

test('hexToAss converts RGB to the ASS BGR format and falls back to white', () => {
  assert.equal(hexToAss('#FFD400'), '&H0000D4FF')
  assert.equal(hexToAss('nope'), '&H00FFFFFF')
})

test('wrapTitle wraps on 3 lines at most and truncates instead of adding a 4th line', () => {
  assert.deepEqual(wrapTitle('Il pense que les femmes ont une intelligence superieure', 3, 24), ['Il pense que les femmes', 'ont une intelligence', 'superieure'])
  const long = wrapTitle('un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize', 3, 12)
  assert.equal(long.length, 3)
  assert.ok(long[2].endsWith('…'))
})

test('buildAss shows words one by one, highlights keywords and puts the title in the band', () => {
  const ass = buildAss({
    title: 'Mon titre',
    durationSec: 5,
    words: [
      { start: 0.5, end: 0.9, text: 'Une' },
      { start: 1.0, end: 1.4, text: 'meuf,' },
      { start: 3.0, end: 3.3, text: 'fin' }
    ],
    subtitleStyle: { keywords: ['Meuf'], highlightColor: '#FF0000' }
  })
  assert.match(ass, /Style: Title,Luckiest Guy/)
  assert.match(ass, /Dialogue: 0,0:00:00\.00,0:00:05\.00,Title,,0,0,0,,Mon titre/)
  assert.match(ass, /Dialogue: 1,0:00:00\.50,0:00:01\.00,Word,,0,0,0,,UNE/)
  assert.match(ass, /\{\\c&H000000FF\}MEUF,/)
  // le dernier mot reste 0,4 s maximum apres sa fin
  assert.match(ass, /Dialogue: 1,0:00:03\.00,0:00:03\.70,Word/)
  assert.equal(normalizeWord('Éléphant!'), 'elephant')
})

test('buildAss can disable subtitles and title', () => {
  const ass = buildAss({ title: 'T', durationSec: 2, words: [{ start: 0, end: 1, text: 'a' }], titleStyle: { enabled: false }, subtitleStyle: { enabled: false } })
  assert.equal(/Dialogue:/.test(ass), false)
})

test('mergeWordFragments glues elisions, hyphens and punctuation to the previous word', () => {
  const merged = mergeWordFragments([
    { start: 0, end: 0.2, text: 'est' },
    { start: 0.2, end: 0.3, text: '-ce' },
    { start: 0.3, end: 0.5, text: 'que' },
    { start: 0.5, end: 0.6, text: 'l' },
    { start: 0.6, end: 1.0, text: "'existence" },
    { start: 1.0, end: 1.1, text: '.' }
  ])
  assert.deepEqual(merged.map(w => w.text), ['est-ce', 'que', "l'existence."])
  assert.equal(merged[2].start, 0.5)
  assert.equal(merged[2].end, 1.1)
})

test('planCut measures the minimum on the trimmed duration', () => {
  const w = (text: string, at: number) => ({ start: at, end: at + 0.3, text })
  const words = [w('Debut.', 0), w('Puis', 10), w('suite.', 10.4), w('Fin.', 20), w('Chute.', 20.4)]
  const seg = [{ start: 0, end: 20.7, text: 'x', words }]
  const plan = planCut(seg, 20.7, { minSec: 5, maxSec: 40, maxPauseSec: 0.5, keepPauseSec: 0.2 })!
  assert.ok(plan.durationSec >= 5 || plan.meetsMin === false)
  assert.equal(plan.meetsMin, plan.durationSec >= 5)
})

test('cropRect centers a 9:16 window on the streamer and stays inside the frame', () => {
  assert.deepEqual(cropRect(1280, 720, { centerX: 0.5, centerY: 0.5, zoom: 1 }), { w: 406, h: 720, x: 437, y: 0 })
  const edge = cropRect(1280, 720, { centerX: 0.02, centerY: 0.5, zoom: 1 })
  assert.equal(edge.x, 0)
  const close = cropRect(1280, 720, { centerX: 0.5, centerY: 0.5, zoom: 2 })
  assert.equal(close.h, 360)
})

test('buildRenderArgs builds a graph with cuts, band, subtitles, zoom intro, wind sfx and capped threads', () => {
  const { args, filterComplex, durationSec } = buildRenderArgs({
    input: 'https://example/v.m3u8', sourceStartSec: 100, sourceDurationSec: 20,
    sourceWidth: 1280, sourceHeight: 720,
    keepRanges: [{ start: 100, end: 108 }, { start: 110, end: 118 }],
    assFile: 'clip.ass', outPath: 'out.mp4', style: DEFAULT_RENDER_STYLE, threads: 1
  })
  assert.equal(durationSec, 16)
  assert.ok(args.slice(0, 6).join(' ') === '-ss 100 -t 20 -i https://example/v.m3u8')
  assert.match(filterComplex, /concat=n=2:v=1:a=1\[vc\]\[ac\]/)
  assert.match(filterComplex, /drawbox=x=0:y=0:w=1080:h=300/)
  assert.match(filterComplex, /ass=clip\.ass/)
  assert.match(filterComplex, /zoompan=/)
  assert.match(filterComplex, /anoisesrc=/)
  assert.ok(args.join(' ').includes('-threads 1'))
  assert.equal(args[args.length - 1], 'out.mp4')
})

test('buildRenderArgs adds the split-screen illustration and the avatar overlay with their windows', () => {
  const { filterComplex, args } = buildRenderArgs({
    input: 'v.mp4', sourceStartSec: 0, sourceDurationSec: 30, sourceWidth: 1280, sourceHeight: 720,
    keepRanges: [{ start: 0, end: 30 }], assFile: 'c.ass', outPath: 'o.mp4',
    illustrations: [{ path: 'b.mp4', start: 5, end: 9 }],
    style: { ...DEFAULT_RENDER_STYLE, sfx: { enabled: false, volume: 0.5, rules: {} }, zoomIntro: { enabled: false, amount: 0, durationSec: 0 },
      overlay: { path: 'logo.gif', x: 800, y: 1500, width: 200, animated: true, windows: [{ start: 2, end: 4 }, { start: 20, end: 22 }] } }
  })
  assert.match(filterComplex, /overlay=0:300:enable='between\(t,5,9\)'/)
  assert.match(filterComplex, /overlay=0:1100:enable='between\(t,5,9\)'/)
  assert.match(filterComplex, /between\(t,2,4\)\+between\(t,20,22\)/)
  assert.ok(args.includes('-ignore_loop'))
  assert.ok(args.includes('-stream_loop'))
  assert.equal(/amix/.test(filterComplex), false)
})

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0

test('real ffmpeg renders a 1080x1920 clip with in-sync audio and video (silences cut)', { skip: !hasFfmpeg }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cw-render-'))
  try {
    await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=12', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(dir, 'src.mp4')], { lowPriority: false })
    writeFileSync(join(dir, 'clip.ass'), buildAss({ title: 'Test de rendu', durationSec: 9, words: [{ start: 1, end: 1.5, text: 'salut' }] }))
    const { args, durationSec } = buildRenderArgs({
      input: 'src.mp4', sourceStartSec: 0, sourceDurationSec: 12, sourceWidth: 1280, sourceHeight: 720,
      keepRanges: [{ start: 1, end: 5 }, { start: 7, end: 12 }], assFile: 'clip.ass', outPath: 'out.mp4', style: DEFAULT_RENDER_STYLE
    })
    await runFfmpeg(args, { cwd: dir, lowPriority: false, timeoutMs: 120_000 })
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,duration', '-of', 'json', join(dir, 'out.mp4')], { encoding: 'utf8' })
    const streams = JSON.parse(probe.stdout).streams
    const video = streams.find((s: any) => s.codec_type === 'video')
    const audio = streams.find((s: any) => s.codec_type === 'audio')
    assert.equal(video.width, 1080)
    assert.equal(video.height, 1920)
    assert.ok(Math.abs(Number(video.duration) - durationSec) < 0.2)
    assert.ok(Math.abs(Number(audio.duration) - Number(video.duration)) < 0.2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('real ffmpeg renders split-screen illustration, animated avatar and a custom sfx file', { skip: !hasFfmpeg }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cw-render2-'))
  try {
    const gen = (args: string[]) => runFfmpeg(args, { lowPriority: false })
    await gen(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=10', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(dir, 'src.mp4')])
    await gen(['-f', 'lavfi', '-i', 'smptebars=size=640x360:rate=30:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(dir, 'broll.mp4')])
    await gen(['-f', 'lavfi', '-i', 'color=c=red:size=100x100:rate=10:duration=1', join(dir, 'logo.gif')])
    await gen(['-f', 'lavfi', '-i', 'anoisesrc=d=1:c=brown', '-c:a', 'pcm_s16le', join(dir, 'whoosh.wav')])
    writeFileSync(join(dir, 'clip.ass'), buildAss({ title: 'Ecran scinde', durationSec: 10, words: [] }))
    const { args } = buildRenderArgs({
      input: 'src.mp4', sourceStartSec: 0, sourceDurationSec: 10, sourceWidth: 1280, sourceHeight: 720,
      keepRanges: [{ start: 0, end: 10 }], assFile: 'clip.ass', outPath: 'out.mp4',
      illustrations: [{ path: 'broll.mp4', start: 3, end: 6 }],
      style: { ...DEFAULT_RENDER_STYLE, sfx: { enabled: true, volume: 0.6, rules: { intro: { path: 'whoosh.wav' }, illustration: { builtin: 'pop' }, avatar: { builtin: 'ding' } } },
        overlay: { path: 'logo.gif', x: 850, y: 1600, width: 160, animated: true, windows: [{ start: 1, end: 2 }, { start: 7, end: 9 }] } }
    })
    await runFfmpeg(args, { cwd: dir, lowPriority: false, timeoutMs: 120_000 })
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,duration', '-of', 'json', join(dir, 'out.mp4')], { encoding: 'utf8' })
    const streams = JSON.parse(probe.stdout).streams
    assert.equal(streams.find((s: any) => s.codec_type === 'video').height, 1920)
    assert.ok(Math.abs(Number(streams.find((s: any) => s.codec_type === 'video').duration) - 10) < 0.2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('sfxEvents plays one sound per active situation at the right instants', () => {
  const base = { input: 'v.mp4', sourceStartSec: 0, sourceDurationSec: 30, sourceWidth: 1280, sourceHeight: 720, keepRanges: [{ start: 0, end: 30 }], assFile: 'c.ass', outPath: 'o.mp4' }
  const overlay = { path: 'logo.gif', x: 0, y: 0, width: 100, animated: false, windows: [{ start: 12, end: 15 }] }
  const events = sfxEvents({ ...base, illustrations: [{ path: 'a.mp4', start: 5, end: 9 }, { path: 'b.mp4', start: 20, end: 24 }],
    style: { ...DEFAULT_RENDER_STYLE, overlay, sfx: { enabled: true, volume: 0.5, rules: { intro: { builtin: 'wind' }, illustration: { builtin: 'whoosh' }, avatar: { builtin: 'pop' } } } } })
  assert.deepEqual(events.map(e => e.at), [0, 5, 20, 12])
  assert.deepEqual(sfxEvents({ ...base, style: { ...DEFAULT_RENDER_STYLE, sfx: { enabled: false, volume: 0.5, rules: { intro: { builtin: 'wind' } } } } }), [])
  assert.deepEqual(sfxEvents({ ...base, style: { ...DEFAULT_RENDER_STYLE, sfx: { enabled: true, volume: 0.5, rules: { avatar: { builtin: 'pop' } } } } }), [])
  const graph = buildRenderArgs({ ...base, illustrations: [{ path: 'a.mp4', start: 5, end: 9 }], style: { ...DEFAULT_RENDER_STYLE, sfx: { enabled: true, volume: 0.5, rules: { intro: { builtin: 'wind' }, illustration: { builtin: 'ding' } } } } }).filterComplex
  assert.match(graph, /adelay=5000:all=1/)
  assert.match(graph, /amix=inputs=3/)
})

test('real ffmpeg synthesises every built-in sound and mixes them with the voice', { skip: !hasFfmpeg }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cw-sfx-'))
  try {
    const gen = (args: string[]) => runFfmpeg(args, { lowPriority: false })
    await gen(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(dir, 'src.mp4')])
    writeFileSync(join(dir, 'clip.ass'), buildAss({ title: 'Sons', durationSec: 4, words: [] }))
    for (const builtin of BUILTIN_SOUNDS.map(b => b.id)) {
      const { args } = buildRenderArgs({
        input: 'src.mp4', sourceStartSec: 0, sourceDurationSec: 4, sourceWidth: 640, sourceHeight: 360,
        keepRanges: [{ start: 0, end: 4 }], assFile: 'clip.ass', outPath: builtin + '.mp4',
        style: { ...DEFAULT_RENDER_STYLE, zoomIntro: { enabled: false, amount: 0, durationSec: 0 }, sfx: { enabled: true, volume: 0.6, rules: { intro: { builtin }, avatar: undefined } } }
      })
      await runFfmpeg(args, { cwd: dir, lowPriority: false, timeoutMs: 120_000 })
      const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', join(dir, builtin + '.mp4')], { encoding: 'utf8' })
      assert.ok(JSON.parse(probe.stdout).streams.some((s: any) => s.codec_type === 'audio'), builtin)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
