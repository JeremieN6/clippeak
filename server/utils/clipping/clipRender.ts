import type { KeepRange } from './cutPlanner.ts'
import { BUILTIN_SYNTH } from './sounds.ts'
import type { BuiltinSound } from './sounds.ts'

export const OUT_WIDTH = 1080
export const OUT_HEIGHT = 1920

export interface Framing {
  // Position du streamer dans l'image source (0..1). 0,5 = centre.
  centerX: number
  centerY: number
  // 1 = plan large (toute la hauteur de la source) ; 1,5 = grand plan.
  zoom: number
}

export interface OverlaySpec {
  path: string
  // Position du coin haut-gauche (px sur 1080x1920) et largeur d'affichage.
  x: number
  y: number
  width: number
  // Fenetres d'affichage en temps de clip ; vide = toute la duree.
  windows: Array<{ start: number, end: number }>
  // GIF anime (boucle) ou image fixe.
  animated: boolean
}

export interface IllustrationSpec {
  path: string
  // Fenetre en temps de clip : le streamer passe en bas, l'illustration en haut.
  start: number
  end: number
}

// Bruitage integre (synthetise) ou fichier du streamer.
export type SoundRef = { builtin: BuiltinSound } | { path: string }

export interface SfxRules {
  intro?: SoundRef
  illustration?: SoundRef
  avatar?: SoundRef
}

// Ecran partage : ce que le streamer lit ou regarde en haut, sa camera en bas (voir layoutDetect.ts). Rectangles normalises (0..1)
// par la taille de la source.
export interface SplitLayout {
  cam: { x: number, y: number, w: number, h: number }
  content: { x: number, y: number, w: number, h: number }
  // Hauteur du visage dans la camera (0 = haut, 1 = bas).
  camFocusY: number
}

export interface RenderStyleOptions {
  bandHeight: number
  zoomIntro: { enabled: boolean, amount: number, durationSec: number }
  sfx: { enabled: boolean, volume: number, rules: SfxRules }
  framing: Framing
  // Si present, remplace le cadrage 9:16 : contenu en haut, camera en bas.
  split?: SplitLayout
  overlay?: OverlaySpec
}

export const DEFAULT_RENDER_STYLE: RenderStyleOptions = {
  bandHeight: 300,
  zoomIntro: { enabled: true, amount: 0.12, durationSec: 0.6 },
  sfx: { enabled: true, volume: 0.6, rules: { intro: { builtin: 'wind' } } },
  framing: { centerX: 0.5, centerY: 0.5, zoom: 1 }
}

export interface RenderSpec {
  // Playlist HLS (URL) ou fichier : l'entree est decodee a partir de sourceStartSec (recherche precise).
  input: string
  sourceStartSec: number
  sourceDurationSec: number
  sourceWidth: number
  sourceHeight: number
  // Plages conservees, en temps de VOD.
  keepRanges: KeepRange[]
  // Fichier ASS (nom relatif au repertoire de travail ffmpeg) et dossier de polices optionnel.
  assFile: string
  fontsDir?: string
  outPath: string
  style: RenderStyleOptions
  illustrations?: IllustrationSpec[]
  // Reglages d'encodage : le VPS n'a que 2 coeurs partages avec le site.
  threads?: number
  preset?: string
  crf?: number
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
const num = (n: number) => String(Math.round(n * 1000) / 1000)

// Rectangle 9:16 decoupe dans l'image source, centre sur le streamer et borne a l'image.
export function cropRect(sourceWidth: number, sourceHeight: number, framing: Framing) {
  const zoom = Math.max(1, framing.zoom)
  const h = even(sourceHeight / zoom)
  const w = Math.min(even(h * OUT_WIDTH / OUT_HEIGHT), sourceWidth)
  const x = Math.min(Math.max(0, Math.round(framing.centerX * sourceWidth - w / 2)), sourceWidth - w)
  const y = Math.min(Math.max(0, Math.round(framing.centerY * sourceHeight - h / 2)), sourceHeight - h)
  return { w, h, x, y }
}

// Hauteurs des deux zones d'un ecran partage (sous la bande du titre) : camera incrustee 760 px, panneau camera pleine hauteur
// 860 px (le visage y est plus grand), le contenu prend le reste.
export function splitZones(split: SplitLayout, _sourceWidth: number, _sourceHeight: number, bandHeight: number): { camH: number, contentH: number } {
  const camH = split.cam.h >= 0.9 ? 860 : 760
  return { camH, contentH: OUT_HEIGHT - bandHeight - camH }
}

const rectPx = (rect: { x: number, y: number, w: number, h: number }, width: number, height: number) => {
  const x = Math.min(width - 2, Math.max(0, Math.round(rect.x * width / 2) * 2))
  const y = Math.min(height - 2, Math.max(0, Math.round(rect.y * height / 2) * 2))
  return { x, y, w: Math.min(width - x, even(rect.w * width)), h: Math.min(height - y, even(rect.h * height)) }
}

function betweenExpr(windows: Array<{ start: number, end: number }>): string {
  return windows.map(w => `between(t,${num(w.start)},${num(w.end)})`).join('+')
}

export interface SfxEvent {
  // Instant (secondes de clip) et bruitage.
  at: number
  sound: SoundRef
}

const MAX_SFX_EVENTS = 6

// Bruitages a jouer : un par situation active (debut du clip, chaque illustration, apparition de l'avatar).
export function sfxEvents(spec: RenderSpec): SfxEvent[] {
  const { sfx, overlay } = spec.style
  if (!sfx.enabled) return []
  const events: SfxEvent[] = []
  if (sfx.rules.intro) events.push({ at: 0, sound: sfx.rules.intro })
  if (sfx.rules.illustration) for (const ill of spec.illustrations ?? []) events.push({ at: ill.start, sound: sfx.rules.illustration })
  if (sfx.rules.avatar && overlay) events.push({ at: overlay.windows[0]?.start ?? 0, sound: sfx.rules.avatar })
  return events.slice(0, MAX_SFX_EVENTS)
}

// Construit la commande ffmpeg complete (arguments + graphe de filtres) pour un clip vertical 1080x1920 :
// coupe des silences (concat), cadrage sur le streamer, zoom d'ouverture, bande noire + titre + sous-titres (ASS),
// illustrations en ecran scinde, avatar/GIF, bruit de vent au zoom.
export function buildRenderArgs(spec: RenderSpec): { args: string[], filterComplex: string, durationSec: number } {
  const { style } = spec
  const filters: string[] = []
  const args: string[] = ['-ss', num(spec.sourceStartSec), '-t', num(spec.sourceDurationSec), '-i', spec.input]

  // --- Coupe : une paire trim/atrim par plage conservee, puis concat.
  const ranges = spec.keepRanges.map(r => ({ start: r.start - spec.sourceStartSec, end: r.end - spec.sourceStartSec }))
  ranges.forEach((r, i) => {
    filters.push(`[0:v]trim=start=${num(r.start)}:end=${num(r.end)},setpts=PTS-STARTPTS[v${i}]`)
    filters.push(`[0:a]atrim=start=${num(r.start)}:end=${num(r.end)},asetpts=PTS-STARTPTS[a${i}]`)
  })
  const durationSec = ranges.reduce((sum, r) => sum + (r.end - r.start), 0)
  if (ranges.length === 1) {
    filters.push('[v0]null[vc]', '[a0]anull[ac]')
  } else {
    filters.push(`${ranges.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${ranges.length}:v=1:a=1[vc][ac]`)
  }

  const bandH = style.bandHeight
  const zones = style.split ? splitZones(style.split, spec.sourceWidth, spec.sourceHeight, bandH) : null
  if (style.split && zones) {
    // --- Ecran partage : contenu (image nette sur son propre decor flou) en haut, camera recadree sur le visage en bas.
    const content = rectPx(style.split.content, spec.sourceWidth, spec.sourceHeight)
    const cam = rectPx(style.split.cam, spec.sourceWidth, spec.sourceHeight)
    // Camera mise a la largeur du clip puis recadree en hauteur autour du visage.
    const camScaledH = Math.max(zones.camH, Math.round(OUT_WIDTH * cam.h / cam.w))
    const camY = Math.min(camScaledH - zones.camH, Math.max(0, Math.round(style.split.camFocusY * camScaledH - zones.camH * 0.45)))
    filters.push(
      '[vc]split=2[sc][sm]',
      `[sc]crop=${content.w}:${content.h}:${content.x}:${content.y},split=2[sb][sf]`,
      `[sb]scale=${OUT_WIDTH}:${zones.contentH}:force_original_aspect_ratio=increase,crop=${OUT_WIDTH}:${zones.contentH},boxblur=30:3,eq=brightness=-0.12[sbg]`,
      `[sf]scale=${OUT_WIDTH}:${zones.contentH}:force_original_aspect_ratio=decrease:flags=lanczos[sfg]`,
      '[sbg][sfg]overlay=(W-w)/2:(H-h)/2[stop]',
      `[sm]crop=${cam.w}:${cam.h}:${cam.x}:${cam.y},scale=${OUT_WIDTH}:${camScaledH}:flags=lanczos,crop=${OUT_WIDTH}:${zones.camH}:0:${camY}[sbot]`,
      `[stop][sbot]vstack=inputs=2,pad=${OUT_WIDTH}:${OUT_HEIGHT}:0:${bandH}:black,setsar=1,fps=30[vf]`
    )
  } else {
    // --- Cadrage 9:16 sur le streamer puis mise a l'echelle.
    const crop = cropRect(spec.sourceWidth, spec.sourceHeight, style.framing)
    filters.push(`[vc]crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${OUT_WIDTH}:${OUT_HEIGHT}:flags=lanczos,setsar=1,fps=30[vf]`)
  }

  // --- Zoom d'ouverture : zoompan sur la seule premiere fraction du clip.
  let current = 'vf'
  if (style.zoomIntro.enabled && durationSec > style.zoomIntro.durationSec + 0.5) {
    const d = style.zoomIntro.durationSec
    const zoomExpr = `1+${num(style.zoomIntro.amount)}*max(0,1-on/${num(d * 30)})`
    filters.push(
      '[vf]split=2[zs1][zs2]',
      `[zs1]trim=end=${num(d)},setpts=PTS-STARTPTS,zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${OUT_WIDTH}x${OUT_HEIGHT}:fps=30[zin]`,
      `[zs2]trim=start=${num(d)},setpts=PTS-STARTPTS[zrest]`,
      '[zin][zrest]concat=n=2:v=1:a=0[vz]'
    )
    current = 'vz'
  }

  // --- Illustrations : ecran scinde (illustration en haut, streamer en bas) pendant leur fenetre.
  const inputs: Array<{ kind: 'sfx' | 'overlay' | 'illustration', index: number }> = []
  let nextInput = 1
  const topH = zones ? zones.contentH : 800
  const bottomY = bandH + topH
  const bottomH = OUT_HEIGHT - bottomY
  ;(spec.illustrations ?? []).forEach((ill, k) => {
    const idx = nextInput++
    inputs.push({ kind: 'illustration', index: idx })
    args.push('-stream_loop', '-1', '-i', ill.path)
    const enable = `between(t,${num(ill.start)},${num(ill.end)})`
    const illustrationTop = `[${idx}:v]scale=${OUT_WIDTH}:${topH}:force_original_aspect_ratio=increase,crop=${OUT_WIDTH}:${topH},setsar=1,fps=30,setpts=PTS-STARTPTS+${num(ill.start)}/TB[itop${k}]`
    if (zones) {
      // Ecran partage : l'illustration remplace le contenu, la camera reste en bas.
      filters.push(illustrationTop, `[${current}][itop${k}]overlay=0:${bandH}:enable='${enable}':eof_action=pass[iz${k}]`)
    } else {
      filters.push(
        `[${current}]split=2[ib${k}][ic${k}]`,
        `[ic${k}]crop=${OUT_WIDTH}:${bottomH}:0:${Math.round((OUT_HEIGHT - bottomH) / 2)}[ibot${k}]`,
        illustrationTop,
        `[ib${k}][itop${k}]overlay=0:${bandH}:enable='${enable}':eof_action=pass[io${k}]`,
        `[io${k}][ibot${k}]overlay=0:${bottomY}:enable='${enable}'[iz${k}]`
      )
    }
    current = `iz${k}`
  })

  // --- Bande noire du titre (le texte est dessine par le filtre ass, au-dessus).
  filters.push(`[${current}]drawbox=x=0:y=0:w=${OUT_WIDTH}:h=${bandH}:color=black@1:t=fill[vb]`)
  current = 'vb'

  // --- Titre et sous-titres.
  const fontsPart = spec.fontsDir ? `:fontsdir=${spec.fontsDir}` : ''
  filters.push(`[${current}]ass=${spec.assFile}${fontsPart}[vs]`)
  current = 'vs'

  // --- Avatar / GIF du streamer.
  if (style.overlay) {
    const idx = nextInput++
    inputs.push({ kind: 'overlay', index: idx })
    if (style.overlay.animated) args.push('-ignore_loop', '0', '-i', style.overlay.path)
    else args.push('-loop', '1', '-i', style.overlay.path)
    const enable = style.overlay.windows.length ? `:enable='${betweenExpr(style.overlay.windows)}'` : ''
    filters.push(
      `[${idx}:v]scale=${even(style.overlay.width)}:-2,format=rgba[ov]`,
      `[${current}][ov]overlay=${Math.round(style.overlay.x)}:${Math.round(style.overlay.y)}:shortest=1${enable}[vo]`
    )
    current = 'vo'
  }

  // --- Audio : bruitages (vent, whoosh, pop... ou fichiers du streamer) aux instants choisis, melanges a la voix.
  let audioOut = 'ac'
  const events = sfxEvents(spec)
  if (events.length) {
    events.forEach((event, i) => {
      const delay = Math.max(0, Math.round(event.at * 1000))
      const tail = `adelay=${delay}:all=1,volume=${num(style.sfx.volume)}[sfx${i}]`
      if ('path' in event.sound) {
        const idx = nextInput++
        inputs.push({ kind: 'sfx', index: idx })
        args.push('-i', event.sound.path)
        filters.push(`[${idx}:a]atrim=duration=4,asetpts=PTS-STARTPTS,${tail}`)
      } else {
        filters.push(`${BUILTIN_SYNTH[event.sound.builtin]},${tail}`)
      }
    })
    // amix divise chaque entree par le nombre d'entrees : volume=N compense, alimiter evite l'ecretage.
    const labels = events.map((_, i) => `[sfx${i}]`).join('')
    filters.push(`[ac]${labels}amix=inputs=${events.length + 1}:duration=first:dropout_transition=0,volume=${events.length + 1},alimiter=limit=0.95[am]`)
    audioOut = 'am'
  }

  // Fin adoucie : le son s'eteint sur 0,5 s au lieu de s'arreter net (l'image reste, jamais de fondu au noir).
  if (durationSec > 4) {
    filters.push(`[${audioOut}]afade=t=out:st=${num(durationSec - 0.5)}:d=0.5[afo]`)
    audioOut = 'afo'
  }

  const preset = spec.preset ?? 'veryfast'
  const crf = spec.crf ?? 22
  const filterComplex = filters.join(';')
  args.push(
    '-filter_complex', filterComplex,
    '-map', `[${current}]`, '-map', `[${audioOut}]`,
    '-t', num(durationSec),
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-threads', String(spec.threads ?? 2),
    '-movflags', '+faststart',
    spec.outPath
  )
  return { args, filterComplex, durationSec }
}
