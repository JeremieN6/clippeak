import type { KeepRange } from './cutPlanner.ts'

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

export interface RenderStyleOptions {
  bandHeight: number
  zoomIntro: { enabled: boolean, amount: number, durationSec: number }
  sfx: { enabled: boolean, path?: string, volume: number }
  framing: Framing
  overlay?: OverlaySpec
}

export const DEFAULT_RENDER_STYLE: RenderStyleOptions = {
  bandHeight: 300,
  zoomIntro: { enabled: true, amount: 0.12, durationSec: 0.6 },
  sfx: { enabled: true, volume: 0.6 },
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

function betweenExpr(windows: Array<{ start: number, end: number }>): string {
  return windows.map(w => `between(t,${num(w.start)},${num(w.end)})`).join('+')
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

  // --- Cadrage 9:16 sur le streamer puis mise a l'echelle.
  const crop = cropRect(spec.sourceWidth, spec.sourceHeight, style.framing)
  filters.push(`[vc]crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${OUT_WIDTH}:${OUT_HEIGHT}:flags=lanczos,setsar=1,fps=30[vf]`)

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
  const bandH = style.bandHeight
  const topH = 800
  const bottomY = bandH + topH
  const bottomH = OUT_HEIGHT - bottomY
  ;(spec.illustrations ?? []).forEach((ill, k) => {
    const idx = nextInput++
    inputs.push({ kind: 'illustration', index: idx })
    args.push('-stream_loop', '-1', '-i', ill.path)
    const enable = `between(t,${num(ill.start)},${num(ill.end)})`
    filters.push(
      `[${current}]split=2[ib${k}][ic${k}]`,
      `[ic${k}]crop=${OUT_WIDTH}:${bottomH}:0:${Math.round((OUT_HEIGHT - bottomH) / 2)}[ibot${k}]`,
      `[${idx}:v]scale=${OUT_WIDTH}:${topH}:force_original_aspect_ratio=increase,crop=${OUT_WIDTH}:${topH},setsar=1,fps=30,setpts=PTS-STARTPTS+${num(ill.start)}/TB[itop${k}]`,
      `[ib${k}][itop${k}]overlay=0:${bandH}:enable='${enable}':eof_action=pass[io${k}]`,
      `[io${k}][ibot${k}]overlay=0:${bottomY}:enable='${enable}'[iz${k}]`
    )
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

  // --- Audio : bruit de vent a l'ouverture (fichier du streamer, sinon synthetise), melange a la voix.
  let audioOut = 'ac'
  if (style.sfx.enabled) {
    if (style.sfx.path) {
      const idx = nextInput++
      inputs.push({ kind: 'sfx', index: idx })
      args.push('-i', style.sfx.path)
      filters.push(`[${idx}:a]volume=${num(style.sfx.volume)}[sfx]`)
    } else {
      filters.push(`anoisesrc=d=0.9:c=pink:a=0.5,lowpass=f=1400,afade=t=in:d=0.25,afade=t=out:st=0.5:d=0.4,volume=${num(style.sfx.volume)}[sfx]`)
    }
    // amix divise chaque entree par le nombre d'entrees : volume=2 compense, alimiter evite l'ecretage.
    filters.push('[ac][sfx]amix=inputs=2:duration=first:dropout_transition=0,volume=2,alimiter=limit=0.95[am]')
    audioOut = 'am'
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
