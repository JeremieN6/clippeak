import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_MOVES, panAt, planTrack, smoothstep } from './faceTrack.ts'
import type { TimedHit } from './faceTrack.ts'
import { detectFraming } from './framingDetect.ts'
import { panCropFilter, panExpression, buildRenderArgs } from './clipRender.ts'
import { renderJob } from './clipJobPipeline.ts'
import type { JobContext } from './clipJobPipeline.ts'
import { parseStyle } from './streamerStyle.ts'

const hit = (t: number, cx: number, w = 0.06, h = 0.13, cy = 0.35): TimedHit => ({ t, found: true, similarity: 0.7, box: { x: cx - w / 2, y: cy - h / 2, w, h } })
const miss = (t: number): TimedHit => ({ t, found: false, similarity: 0.1 })
// Streamer immobile, puis qui se deplace vers la droite a mi-clip.
const times = Array.from({ length: 20 }, (_, i) => i * 1.5)

test('streamer qui ne bouge presque pas : cadre fixe, aucun mouvement', () => {
  const hits = times.map((t, i) => hit(t, 0.5 + (i % 2 ? 0.004 : -0.004)))
  const plan = planTrack(hits, 0)!
  assert.deepEqual(plan.moves, [])
  assert.ok(Math.abs(plan.centerX - 0.5) < 0.02)
})

test('streamer qui se deplace : un mouvement lent et doux, qui commence avant qu il atteigne le bord', () => {
  const hits = times.map(t => hit(t, t < 12 ? 0.4 : 0.62))
  const plan = planTrack(hits, 0)!
  assert.ok(plan.moves.length >= 1 && plan.moves.length <= MAX_MOVES)
  const move = plan.moves[0]
  assert.ok(move.dur >= 1.4, 'jamais brusque')
  assert.ok(move.at < 12, 'commence avant le premier instant ou il est deja parti')
  assert.ok(Math.abs(move.to - 0.62) < 0.05)
  // Depart a sa position du debut : pas de mouvement a l'ouverture
  assert.ok(Math.abs(plan.centerX - 0.4) < 0.03)
  // Le visage reste dans le cadre a chaque image releve
  const cropW = 9 / 16 / (16 / 9) / plan.zoom
  for (const h of hits) assert.ok(Math.abs(h.box!.x + h.box!.w / 2 - panAt(plan.centerX, plan.moves, h.t)) < cropW / 2, `visible a ${h.t}`)
})

test('le mouvement est continu : pas d a-coup (vitesse nulle au debut et a la fin, jamais de saut)', () => {
  assert.equal(smoothstep(0), 0)
  assert.equal(smoothstep(1), 1)
  const hits = times.map(t => hit(t, t < 8 ? 0.35 : t < 18 ? 0.55 : 0.4))
  const plan = planTrack(hits, 0)!
  let prev = panAt(plan.centerX, plan.moves, 0)
  let prevSpeed = 0
  for (let t = 1 / 30; t < 30; t += 1 / 30) {
    const x = panAt(plan.centerX, plan.moves, t)
    const speed = x - prev
    assert.ok(Math.abs(speed) < 0.012, `vitesse ${speed} a ${t}`) // moins de 1,2 % de la largeur par image
    assert.ok(Math.abs(speed - prevSpeed) < 0.0012, `acceleration a ${t}`)
    prev = x; prevSpeed = speed
  }
  // Pause entre deux mouvements
  for (let i = 1; i < plan.moves.length; i++) assert.ok(plan.moves[i].at >= plan.moves[i - 1].at + plan.moves[i - 1].dur)
})

test('detections bruitees : fausse detection ignoree, images manquantes sans effet, nombre de mouvements limite', () => {
  const hits: TimedHit[] = times.map((t, i) => i % 5 === 3 ? miss(t) : hit(t, 0.5))
  hits.push(hit(4.2, 0.95, 0.06, 0.13, 0.9)) // une autre personne tout au bout de l'ecran
  const plan = planTrack(hits, 0)!
  assert.deepEqual(plan.moves, [])
  // Va-et-vient permanent : jamais plus de 5 mouvements
  const wild = times.map((t, i) => hit(t, i % 2 ? 0.3 : 0.7))
  assert.ok(planTrack(wild, 0)!.moves.length <= MAX_MOVES)
  assert.equal(planTrack([hit(1, 0.5), miss(2), miss(3)], 0), null)
})

test('expression du cadre : depart + un terme en S par mouvement', () => {
  assert.equal(panExpression(0.4, []), '0.4')
  const e = panExpression(0.4, [{ at: 1, dur: 2, to: 0.6 }, { at: 5, dur: 2, to: 0.5 }])
  assert.match(e, /^0\.4\+0\.2\*\(clip\(\(t-1\)\/2,0,1\)\*/)
  assert.match(e, /-0\.1\*\(clip\(\(t-5\)\/2,0,1\)/)
  assert.equal((e.match(/\(/g) ?? []).length, (e.match(/\)/g) ?? []).length)
  assert.equal(panAt(0.4, [{ at: 1, dur: 2, to: 0.6 }], 0), 0.4)
  assert.ok(Math.abs(panAt(0.4, [{ at: 1, dur: 2, to: 0.6 }], 2) - 0.5) < 1e-9)
  assert.ok(Math.abs(panAt(0.4, [{ at: 1, dur: 2, to: 0.6 }], 9) - 0.6) < 1e-9)
})

test('detectFraming avec suivi : une passe ffmpeg, trajet renvoye ; sans suivi possible, cadre fixe', async () => {
  let series = 0
  const base = { videoUrl: 'v', startSec: 100, endSec: 130, photos: ['a'], follow: true }
  const frames = (hitFor: (t: number) => TimedHit) => async (req: any) => ({ photos_used: 1, frames: req.frames.map((f: any) => ({ ...hitFor(f.t), t: f.t })) })
  const deps = (locate: any) => ({
    extractFrame: async () => {}, modelsDir: 'm', workDir: async () => 'w', cleanup: async () => {}, locate,
    extractSeries: async (_u: string, _s: number, dur: number, step: number) => { series++; return Array.from({ length: Math.floor(dur / step) }, (_, i) => `f${i}.jpg`) }
  })
  const moving = await detectFraming(base, deps(frames(t => hit(t, t < 115 ? 0.4 : 0.62))))
  assert.equal(series, 1)
  assert.ok(moving && moving.pan && moving.pan.length >= 1)
  assert.ok(moving!.pan![0].at >= 100 && moving!.pan![0].at < 130)
  const still = await detectFraming(base, deps(frames(t => hit(t, 0.5))))
  assert.ok(still && !still.pan)
  const noSeries = await detectFraming({ ...base, follow: false }, deps(frames(t => hit(t, 0.5))))
  assert.ok(noSeries && !noSeries.pan)
  // Streamer jamais reconnu : toujours null (le clip sera refuse)
  assert.equal(await detectFraming(base, deps(frames(t => miss(t)))), null)
})

const words = (list: string[], from: number, step = 0.45) => list.map((text, i) => ({ text, start: from + i * step, end: from + i * step + 0.35 }))
function context(): JobContext {
  const w = [...words(['Alors', 'hier', 'je', 'suis', 'alle', 'au', 'marche.'], 20), ...words(['Et', 'le', 'mec', 'me', 'dit', 'rien', 'du', 'tout', 'mdr.'], 24)]
  return {
    jobId: 'j', channelName: 'Streamer', vodTwitchId: '1', peakSec: 29,
    transcript: [{ start: 20, end: 28, text: 'x', words: w }], hook: 'Alors hier je suis alle au marche', category: null, title: null, plan: null,
    settings: { keywords: [], clipMinSec: 8, clipMaxSec: 25, subtitles: true, accentColor: '#FFFFFF', highlightColor: '#FFD400' },
    style: parseStyle({}), assets: {}, library: [], photoPaths: ['/p/a.jpg']
  }
}

test('le pipeline donne le trajet au rendu, en temps du clip monte, et le coupe de la commande si le suivi est coupe', async () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'cw-follow-'))
  try {
    const seen: string[] = []
    const run = (follow: boolean) => renderJob({ ...context(), style: parseStyle({ framing: { follow } }) }, {
      getVideoUrl: async () => 'v', runFfmpeg: async (args: string[]) => { seen.push(args.join(' ')); return '' },
      collectMetrics: async () => ({ width: 1080, height: 1920, videoSec: 12, audioSec: 12, freezeAtEndSec: null, leadingSilenceSec: 0, trailingSilenceSec: 0 }),
      outputDir,
      detectFraming: async input => ({ centerX: 0.4, centerY: 0.5, zoom: 1, ...(input.follow ? { pan: [{ at: 24, dur: 2, to: 0.6 }] } : {}) })
    })
    await run(true)
    assert.match(seen[0], /min\(2\*floor/)
    assert.match(seen[0], /format=yuv444p/)
    await run(false)
    assert.doesNotMatch(seen[1], /yuv444p/)
  } finally {
    rmSync(outputDir, { recursive: true, force: true })
  }
})

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0

test('ffmpeg reel : le cadre qui glisse donne bien du 1080x1920 et le mouvement est doux, sans a-coup', { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cw-pan-'))
  try {
    const src = join(dir, 'src.mp4')
    spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=6', '-pix_fmt', 'yuv420p', src], { stdio: 'ignore' })
    const out = join(dir, 'out.mp4')
    const vf = panCropFilter(1280, 720, { centerX: 0.4, centerY: 0.5, zoom: 1.2 }, [{ at: 1, dur: 2.5, to: 0.55 }])
    const r = spawnSync('ffmpeg', ['-y', '-i', src, '-vf', vf, '-pix_fmt', 'yuv420p', out], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr?.slice(-400))
    const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out], { encoding: 'utf8' })
    assert.equal(probe.stdout.trim(), '1080,1920')

    const W = 270, H = 480
    const raw = spawnSync('ffmpeg', ['-i', out, '-vf', `scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 }).stdout
    const n = Math.floor(raw.length / (W * H))
    const profile = (i: number) => { const p = new Float64Array(W); for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x++) p[x] += raw[i * W * H + y * W + x]; return p }
    const shift = (a: Float64Array, b: Float64Array) => {
      const score: Record<number, number> = {}
      let best = 0
      for (let s = -10; s <= 10; s++) { let e = 0; for (let x = 12; x < W - 12; x++) { const d = a[x] - b[x + s]; e += d * d } score[s] = e; if (e < score[best]! || score[best] === undefined) best = s }
      const l = score[best - 1] ?? score[best], m = score[best], rr = score[best + 1] ?? score[best]
      const den = l - 2 * m + rr
      return best + (den > 0 ? 0.5 * (l - rr) / den : 0)
    }
    const speeds: number[] = []
    for (let i = 1; i < n; i++) speeds.push(shift(profile(i - 1), profile(i)))
    // Immobile avant 1 s et apres 3,5 s ; jamais de variation brusque de vitesse entre deux images.
    assert.ok(speeds.slice(0, 25).every(v => Math.abs(v) < 0.4), 'immobile au debut')
    assert.ok(speeds.slice(115).every(v => Math.abs(v) < 0.4), 'immobile a la fin')
    let jerk = 0
    for (let i = 1; i < speeds.length; i++) jerk = Math.max(jerk, Math.abs(speeds[i] - speeds[i - 1]))
    assert.ok(jerk < 1.2, `a-coup max ${jerk.toFixed(2)} px`)
    assert.ok(speeds.slice(30, 80).some(v => Math.abs(v) > 1), 'le cadre bouge bien pendant le mouvement')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('buildRenderArgs sans suivi : commande inchangee (crop fixe)', () => {
  const spec: any = {
    input: 'v', sourceStartSec: 0, sourceDurationSec: 10, sourceWidth: 1280, sourceHeight: 720, keepRanges: [{ start: 0, end: 9 }], assFile: 'c.ass', outPath: 'o.mp4',
    style: { bandHeight: 300, zoomIntro: { enabled: false, amount: 0, durationSec: 0.6 }, sfx: { enabled: false, volume: 0.5, rules: {} }, framing: { centerX: 0.5, centerY: 0.5, zoom: 1 } }
  }
  const { filterComplex } = buildRenderArgs(spec)
  assert.doesNotMatch(filterComplex, /yuv444p/)
  assert.match(filterComplex, /crop=406:720:437:0,scale=1080:1920/)
})
