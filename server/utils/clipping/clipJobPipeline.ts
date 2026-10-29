import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { planCut } from './cutPlanner.ts'
import type { CutPlan, KeepRange } from './cutPlanner.ts'
import { buildTimeline } from './timeline.ts'
import { buildAss, fitTitle } from './assBuilder.ts'
import { fitTitleToBand } from './titleFit.ts'
import type { TimedWord } from './assBuilder.ts'
import { buildRenderArgs, splitZones } from './clipRender.ts'
import { evaluateQc } from './clipQc.ts'
import type { ClipMetrics, QcReport } from './clipQc.ts'
import { buildCaption } from './caption.ts'
import { placeIllustrations } from './illustrations.ts'
import type { IllustrationItem, PlacedIllustration } from './illustrations.ts'
import { resolveStyle } from './streamerStyle.ts'
import type { StreamerStyleConfig, StyleAssets } from './streamerStyle.ts'
import type { TranscriptSegment } from './whisperTranscribe.ts'
import type { RunFfmpegOptions } from './ffmpegRunner.ts'
import type { Framing } from './clipRender.ts'
import type { DetectFramingInput } from './framingDetect.ts'
import type { ClipLayout, DetectLayoutInput } from './layoutDetect.ts'

export interface JobContext {
  jobId: string
  // Identifiants de base (VOD et moment) : servent a retrouver l'extrait source du moment.
  vodId?: string
  momentId?: string
  channelName: string
  vodTwitchId: string
  peakSec: number
  transcript: TranscriptSegment[]
  hook: string | null
  category: string | null
  title: string | null
  // Plan deja calcule (nouveau rendu apres un rejet) ; sinon il est calcule ici.
  plan: { startSec: number, endSec: number, keepRanges: KeepRange[] } | null
  settings: { keywords: string[], clipMinSec: number, clipMaxSec: number, subtitles: boolean, accentColor: string, highlightColor: string }
  style: StreamerStyleConfig
  assets: StyleAssets
  library: IllustrationItem[]
  // Photos de reference du streamer (reconnaissance du visage pour le cadrage automatique).
  photoPaths?: string[]
  // Dossier des polices deposees par le streamer (donne a ffmpeg pour le titre et les sous-titres).
  fontsDir?: string
}

export interface JobResult {
  outputPath: string
  title: string
  caption: string
  hashtags: string[]
  plan: CutPlan | { startSec: number, endSec: number, keepRanges: KeepRange[] }
  illustrations: PlacedIllustration[]
  qc: QcReport
}

export interface PipelineDeps {
  getVideoUrl: (vodTwitchId: string) => Promise<string>
  // Source du rendu : l'extrait local s'il couvre le plan (baseSec = instant de la VOD ou il commence), sinon la VOD (baseSec = 0).
  getVideoSource?: (ctx: JobContext, plan: { startSec: number, endSec: number }) => Promise<{ input: string, baseSec: number }>
  detectFraming?: (input: DetectFramingInput) => Promise<Framing | null>
  // Ecran partage (camera incrustee, panneau camera) : renvoie null si le clip est en plein cadre.
  detectLayout?: (input: DetectLayoutInput) => Promise<ClipLayout | null>
  runFfmpeg: (args: string[], options?: RunFfmpegOptions) => Promise<string>
  collectMetrics: (path: string, options?: RunFfmpegOptions) => Promise<ClipMetrics>
  outputDir: string
  fontsDir?: string
  sourceWidth?: number
  sourceHeight?: number
  threads?: number
}

export class QcFailedError extends Error {
  readonly report: QcReport

  constructor(report: QcReport) {
    super(`Controle qualite : ${report.issues.map(i => i.message).join(' ; ')}`)
    this.name = 'QcFailedError'
    this.report = report
  }
}

// Titre par defaut : l'accroche du moment, ramenee a 3 lignes ; le streamer peut le modifier au moment de la validation.
export function defaultTitle(hook: string | null, plan: { hook?: string } | null, maxLines = 3, maxCharsPerLine = 24): string {
  const base = (hook || plan?.hook || '').replace(/\s+/g, ' ').trim()
  return fitTitle(base.charAt(0).toUpperCase() + base.slice(1), maxLines, maxCharsPerLine)
}

// Prepare et rend un clip : plan de coupe, sous-titres, illustrations, rendu ffmpeg, controle qualite, legende.
// Un clip qui echoue au controle qualite n'est pas envoye pour validation (QcFailedError).
export async function renderJob(ctx: JobContext, deps: PipelineDeps): Promise<JobResult> {
  const minSec = ctx.settings.clipMinSec
  const maxSec = ctx.settings.clipMaxSec

  const planned = ctx.plan ?? planCut(ctx.transcript, ctx.peakSec, { minSec, maxSec })
  if (!planned) throw new Error('Transcription vide : impossible de planifier la coupe')
  const plan = planned
  const durationFromRanges = plan.keepRanges.reduce((sum, r) => sum + (r.end - r.start), 0)
  // Pas assez de parole pour atteindre la duree minimale : inutile de rendre un clip que le controle refuserait.
  if (durationFromRanges < minSec - 0.5) {
    throw new Error(`Pas assez de parole autour du pic : ${durationFromRanges.toFixed(1)} s montees pour un minimum de ${minSec} s (baisser la duree minimale ou choisir un autre moment)`)
  }

  const timeline = buildTimeline(plan.keepRanges)
  const words: TimedWord[] = ctx.transcript
    .flatMap(s => s.words?.length ? s.words : [{ start: s.start, end: s.end, text: s.text }])
    .filter(w => w.end > plan.startSec && w.start < plan.endSec)
    .map(w => ({ start: timeline.toClipTime(w.start), end: timeline.toClipTime(w.end), text: w.text }))

  const style = resolveStyle(ctx.style, ctx.settings, ctx.assets, durationFromRanges)
  // Le titre (choisi par le streamer ou tire de l'accroche) doit toujours tenir dans la bande : police reduite si besoin, puis coupe
  // au dernier mot. Un titre trop long ne fait jamais echouer le rendu.
  const rawTitle = ctx.title?.trim() || defaultTitle(ctx.hook, 'hook' in plan ? plan as any : null, Number.MAX_SAFE_INTEGER)
  const fitted = fitTitleToBand(rawTitle, ctx.style.title.fontSize, ctx.style.title.maxLines)
  const layout = { maxLines: fitted.maxLines, maxCharsPerLine: fitted.maxCharsPerLine }
  const title = fitted.text
  const titleStyle = { ...style.title, fontSize: fitted.fontSize, maxLines: fitted.maxLines, maxCharsPerLine: fitted.maxCharsPerLine }

  const illustrations = style.illustrationsEnabled && style.maxIllustrations > 0
    ? placeIllustrations(words, timeline.totalSec, ctx.library, { maxCount: style.maxIllustrations })
    : []

  const workDir = await mkdtemp(join(tmpdir(), 'clippeak-job-'))
  const outPath = join(deps.outputDir, `${ctx.jobId}.mp4`)
  try {
    await mkdir(dirname(outPath), { recursive: true })
    const source = deps.getVideoSource
      ? await deps.getVideoSource(ctx, plan)
      : { input: await deps.getVideoUrl(ctx.vodTwitchId), baseSec: 0 }
    const videoUrl = source.input
    const baseSec = source.baseSec

    // Ecran partage : si le streamer a une camera incrustee ou un panneau camera, le contenu va en haut et la camera en bas.
    let renderStyle = style.render
    let framingWarning: string | null = null
    let split: ClipLayout | null = null
    const sourceWidth = deps.sourceWidth ?? 1280
    const sourceHeight = deps.sourceHeight ?? 720
    if (ctx.style.layout.split === 'auto' && deps.detectLayout) {
      split = await deps.detectLayout({ videoUrl, startSec: plan.startSec - baseSec, endSec: plan.endSec - baseSec, photos: ctx.photoPaths ?? [] }).catch(() => null)
    }
    let subtitleStyle = style.subtitles
    if (split) {
      renderStyle = { ...renderStyle, split: { cam: split.cam, content: split.content, camFocusY: split.camFocusY } }
      // Sous-titres sur la couture entre le contenu et la camera.
      const zones = splitZones(renderStyle.split!, sourceWidth, sourceHeight, renderStyle.bandHeight)
      subtitleStyle = { ...subtitleStyle, marginBottom: Math.round(zones.camH - (subtitleStyle.fontSize ?? 90) * 0.5) }
    }
    await writeFile(join(workDir, 'clip.ass'), buildAss({
      title,
      words,
      durationSec: timeline.totalSec,
      titleStyle,
      subtitleStyle
    }))

    // Cadrage automatique : le streamer doit etre reconnu ; sinon on garde le cadrage manuel et on le signale.
    if (split) {
      // Le cadrage 9:16 ne sert pas : le contenu et la camera sont recadres par la disposition.
    } else if (ctx.style.framing.auto && (ctx.photoPaths?.length ?? 0) > 0 && deps.detectFraming) {
      const detected = await deps.detectFraming({ videoUrl, startSec: plan.startSec - baseSec, endSec: plan.endSec - baseSec, photos: ctx.photoPaths ?? [] }).catch(() => null)
      if (detected) renderStyle = { ...renderStyle, framing: detected }
      else framingWarning = 'Streamer non reconnu dans le clip : cadrage manuel utilise (verifier que personne d\'autre n\'est au centre)'
    } else if (ctx.style.framing.auto) {
      framingWarning = 'Cadrage automatique actif mais aucune photo de reference : cadrage manuel utilise'
    }
    const { args } = buildRenderArgs({
      input: videoUrl,
      sourceStartSec: plan.startSec - baseSec,
      sourceDurationSec: plan.endSec - plan.startSec + 0.5,
      sourceWidth,
      sourceHeight,
      keepRanges: plan.keepRanges.map(r => ({ ...r, start: r.start - baseSec, end: r.end - baseSec })),
      assFile: 'clip.ass',
      fontsDir: deps.fontsDir ?? ctx.fontsDir,
      outPath,
      style: renderStyle,
      illustrations: illustrations.map(i => ({ path: i.path, start: i.start, end: i.end })),
      threads: deps.threads
    })
    await deps.runFfmpeg(args, { cwd: workDir, timeoutMs: 15 * 60_000 })

    const metrics = await deps.collectMetrics(outPath)
    const qc = evaluateQc(metrics, {
      minSec,
      maxSec,
      title,
      titleMaxLines: layout.maxLines,
      titleMaxCharsPerLine: layout.maxCharsPerLine,
      texts: words.map(w => w.text),
      names: [...ctx.style.names, ctx.channelName]
    })
    if (framingWarning) qc.issues.push({ severity: 'warning', code: 'framing', message: framingWarning })
    if (!qc.passed) throw new QcFailedError(qc)

    const { caption, hashtags } = buildCaption({
      title,
      hook: ctx.hook ?? undefined,
      channelName: ctx.channelName,
      category: ctx.category ?? undefined,
      streamerTags: ctx.style.caption.tags
    })
    return { outputPath: outPath, title, caption, hashtags, plan, illustrations, qc }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
