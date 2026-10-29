import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyLayout, detectLayout } from './layoutDetect.ts'
import type { LayoutFrame } from './layoutDetect.ts'
import { buildRenderArgs, DEFAULT_RENDER_STYLE, splitZones } from './clipRender.ts'
import { runFfmpeg } from './ffmpegRunner.ts'
import { defaultStyle, parseStyle } from './streamerStyle.ts'

// Mesures reelles (video publique, ecran de contenu + petite camera en bas au centre + video d'un autre visage a droite).
const pipRect = { x: 0.3828, y: 0.7583, w: 0.2414, h: 0.2403 }
const pipFace = { x: 0.4792, y: 0.8336, w: 0.0345, h: 0.0876, score: 0.9 }
const bigVideoFace = { x: 0.6405, y: 0.2578, w: 0.1843, h: 0.4058, score: 0.93 }
// Les rectangles sont arrondis a 0,001.
const near = (actual: { x: number, y: number, w: number, h: number } | undefined, expected: { x: number, y: number, w: number, h: number }) =>
  assert.ok(actual && (['x', 'y', 'w', 'h'] as const).every(k => Math.abs(actual[k] - expected[k]) <= 0.001), JSON.stringify(actual))
const frame = (t: number, faces: LayoutFrame['faces']): LayoutFrame => ({ t, faces })

test('a small camera framed by sharp edges, found at the same place in most frames, makes a split layout (pip)', () => {
  const frames = [0, 1, 2, 3, 4, 5].map(t => frame(t, [bigVideoFace, { ...pipFace, rect: t === 4 ? { ...pipRect, h: 0.19 } : pipRect }]))
  const layout = classifyLayout(frames, { recognized: false })!
  assert.equal(layout.kind, 'pip')
  near(layout.cam, pipRect)
  assert.deepEqual(layout.content, { x: 0, y: 0, w: 1, h: 1 })
  assert.ok(layout.camFocusY > 0.3 && layout.camFocusY < 0.8)
})

test('a full-screen camera, or a rectangle that shows up only now and then, stays full frame', () => {
  const fullCam = [0, 1, 2, 3, 4, 5].map(t => frame(t, [{ x: 0.42, y: 0.3, w: 0.09, h: 0.24, score: 0.9 }]))
  assert.equal(classifyLayout(fullCam, { recognized: false }), null)
  const sporadic = [0, 1, 2, 3, 4, 5].map(t => frame(t, [{ x: 0.33, y: 0.28, w: 0.14, h: 0.33, score: 0.9, ...(t % 3 === 0 ? { rect: { x: 0.2, y: 0, w: 0.58, h: 1 } } : {}) }]))
  assert.equal(classifyLayout(sporadic, { recognized: false }), null)
  // la camera bouge d'une image a l'autre : pas une camera incrustee
  const moving = [0, 1, 2, 3].map(t => frame(t, [{ ...pipFace, rect: { ...pipRect, x: 0.1 + t * 0.2 } }]))
  assert.equal(classifyLayout(moving, { recognized: false }), null)
  assert.equal(classifyLayout([], { recognized: false }), null)
})

test('with photos, only the recognised face counts: another person inside a rectangle is never taken for the streamer', () => {
  const other = { x: 0.7, y: 0.1, w: 0.1, h: 0.2, score: 0.9, similarity: 0.15, rect: { x: 0.6, y: 0.05, w: 0.35, h: 0.3 } }
  const streamer = { ...pipFace, similarity: 0.7, rect: pipRect }
  const frames = [0, 1, 2, 3].map(t => frame(t, [other, streamer]))
  near(classifyLayout(frames, { recognized: true })?.cam, pipRect)
  assert.equal(classifyLayout(frames.map(f => frame(f.t, [other])), { recognized: true }), null)
})

test('a full-height camera panel next to the content gives a panel layout with the larger side as content', () => {
  const rect = { x: 0.52, y: 0, w: 0.48, h: 0.999 }
  const frames = [0, 1, 2, 3].map(t => frame(t, [{ x: 0.7, y: 0.25, w: 0.2, h: 0.45, score: 0.9, rect }]))
  const layout = classifyLayout(frames, { recognized: false })!
  assert.equal(layout.kind, 'panel')
  assert.deepEqual(layout.content, { x: 0, y: 0, w: 0.52, h: 1 })
  // panneau a gauche : le contenu est a droite
  const left = classifyLayout(frames.map(f => frame(f.t, [{ ...f.faces[0], rect: { x: 0, y: 0, w: 0.45, h: 0.999 } }])), { recognized: false })!
  assert.equal(left.content.x, 0.45)
})

test('detectLayout samples frames, passes the photos only when there are some, and cleans up', async () => {
  const calls: any[] = []
  const frames = [0, 1, 2, 3, 4, 5].map(t => frame(t, [{ ...pipFace, rect: pipRect }]))
  let cleaned = ''
  const deps = {
    extractFrame: async (_url: string, t: number, path: string) => { calls.push(['frame', t, path]) },
    analyse: async (request: any) => { calls.push(['analyse', request.photos]); return { frames } },
    modelsDir: 'm',
    workDir: async () => 'work',
    cleanup: async (d: string) => { cleaned = d }
  }
  const layout = await detectLayout({ videoUrl: 'v', startSec: 100, endSec: 130 }, deps)
  assert.equal(layout?.kind, 'pip')
  assert.equal(calls.filter(c => c[0] === 'frame').length, 6)
  assert.equal(calls.find(c => c[0] === 'analyse')[1], undefined)
  assert.equal(cleaned, 'work')
  await detectLayout({ videoUrl: 'v', startSec: 100, endSec: 130, photos: ['a.jpg'] }, deps)
  assert.deepEqual(calls.filter(c => c[0] === 'analyse')[1][1], ['a.jpg'])
})

test('style: split layout is automatic by default and can be switched off', () => {
  assert.equal(defaultStyle().layout.split, 'auto')
  assert.equal(parseStyle({ layout: { split: 'off' } }).layout.split, 'off')
  assert.throws(() => parseStyle({ layout: { split: 'maybe' } }))
})

test('splitZones: the title band stays, the camera gets 760 px (panel 860), the content the rest', () => {
  const pip = { cam: pipRect, content: { x: 0, y: 0, w: 1, h: 1 }, camFocusY: 0.5 }
  assert.deepEqual(splitZones(pip, 1280, 720, 300), { camH: 760, contentH: 860 })
  assert.deepEqual(splitZones({ ...pip, cam: { x: 0.5, y: 0, w: 0.5, h: 1 } }, 1280, 720, 300), { camH: 860, contentH: 760 })
})

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0

const MINIMAL_ASS = [
  '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1080', 'PlayResY: 1920', '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Word,Lato,60,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,7,3,2,40,40,100,1', '',
  '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text', ''
].join('\n')

test('real ffmpeg: a split render puts the content on top and the camera below at 1080x1920', { skip: !hasFfmpeg }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cw-split-'))
  try {
    // Source 1280x720 : ecran bleu, camera rouge incrustee en bas au centre.
    await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=1280x720:d=3:r=30', '-f', 'lavfi', '-i', 'color=c=red:s=300x170:d=3:r=30', '-f', 'lavfi', '-i', 'sine=frequency=300:d=3',
      '-filter_complex', '[0:v][1:v]overlay=490:540[v]', '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(dir, 'src.mp4')], { lowPriority: false })
    const split = { cam: { x: 0.3828, y: 0.75, w: 0.2344, h: 0.2361 }, content: { x: 0, y: 0, w: 1, h: 1 }, camFocusY: 0.5 }
    const { args } = buildRenderArgs({
      input: join(dir, 'src.mp4'), sourceStartSec: 0, sourceDurationSec: 3, sourceWidth: 1280, sourceHeight: 720, keepRanges: [{ start: 0, end: 3 }],
      assFile: 'clip.ass', outPath: join(dir, 'out.mp4'), style: { ...DEFAULT_RENDER_STYLE, split, zoomIntro: { ...DEFAULT_RENDER_STYLE.zoomIntro, enabled: false } }
    })
    writeFileSync(join(dir, 'clip.ass'), MINIMAL_ASS)
    await runFfmpeg(['-y', ...args], { cwd: dir, lowPriority: false })
    const px = (x: number, y: number) => {
      const raw = spawnSync('ffmpeg', ['-v', 'error', '-ss', '1', '-i', join(dir, 'out.mp4'), '-frames:v', '1', '-vf', `crop=1:1:${x}:${y},format=rgb24`, '-f', 'rawvideo', '-'], { encoding: 'buffer' }).stdout
      return [raw[0], raw[1], raw[2]]
    }
    const [r0, g0, b0] = px(540, 600) // contenu (zone du haut)
    assert.ok(b0 > 150 && r0 < 100 && g0 < 100, `contenu bleu attendu, recu ${r0},${g0},${b0}`)
    const [r1, , b1] = px(540, 1700) // camera (zone du bas)
    assert.ok(r1 > 150 && b1 < 100, `camera rouge attendue, recue ${r1} / ${b1}`)
    const [r2, g2, b2] = px(540, 100) // bande du titre
    assert.ok(r2 < 30 && g2 < 30 && b2 < 30)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
