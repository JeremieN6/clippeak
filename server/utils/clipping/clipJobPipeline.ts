import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { planCut } from './cutPlanner.ts'
import type { CutPlan, KeepRange } from './cutPlanner.ts'
import { buildTimeline } from './timeline.ts'
import { buildAss, wrapTitle } from './assBuilder.ts'
import type { TimedWord } from './assBuilder.ts'
import { buildRenderArgs } from './clipRender.ts'
import { evaluateQc } from './clipQc.ts'
import type { ClipMetrics, QcReport } from './clipQc.ts'
import { buildCaption } from './caption.ts'
import { placeIllustrations } from './illustrations.ts'
import type { IllustrationItem, PlacedIllustration } from './illustrations.ts'
import { resolveStyle } from './streamerStyle.ts'
import type { StreamerStyleConfig, StyleAssets } from './streamerStyle.ts'
import type { TranscriptSegment } from './whisperTranscribe.ts'
import type { RunFfmpegOptions } from './ffmpegRunner.ts'

export interface JobContext {
  jobId: string
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
export function defaultTitle(hook: string | null, plan: { hook?: string } | null, maxLines = 3): string {
  const base = (hook || plan?.hook || '').replace(/\s+/g, ' ').trim()
  const lines = wrapTitle(base.charAt(0).toUpperCase() + base.slice(1), maxLines, 24)
  return lines.join(' ')
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

  const timeline = buildTimeline(plan.keepRanges)
  const words: TimedWord[] = ctx.transcript
    .flatMap(s => s.words?.length ? s.words : [{ start: s.start, end: s.end, text: s.text }])
    .filter(w => w.end > plan.startSec && w.start < plan.endSec)
    .map(w => ({ start: timeline.toClipTime(w.start), end: timeline.toClipTime(w.end), text: w.text }))

  const style = resolveStyle(ctx.style, ctx.settings, ctx.assets, durationFromRanges)
  const title = ctx.title?.trim() || defaultTitle(ctx.hook, 'hook' in plan ? plan as any : null, ctx.style.title.maxLines)

  const illustrations = style.illustrationsEnabled && style.maxIllustrations > 0
    ? placeIllustrations(words, timeline.totalSec, ctx.library, { maxCount: style.maxIllustrations })
    : []

  const workDir = await mkdtemp(join(tmpdir(), 'clippeak-job-'))
  const outPath = join(deps.outputDir, `${ctx.jobId}.mp4`)
  try {
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(join(workDir, 'clip.ass'), buildAss({
      title,
      words,
      durationSec: timeline.totalSec,
      titleStyle: style.title,
      subtitleStyle: style.subtitles
    }))

    const videoUrl = await deps.getVideoUrl(ctx.vodTwitchId)
    const { args } = buildRenderArgs({
      input: videoUrl,
      sourceStartSec: plan.startSec,
      sourceDurationSec: plan.endSec - plan.startSec + 0.5,
      sourceWidth: deps.sourceWidth ?? 1280,
      sourceHeight: deps.sourceHeight ?? 720,
      keepRanges: plan.keepRanges,
      assFile: 'clip.ass',
      fontsDir: deps.fontsDir,
      outPath,
      style: style.render,
      illustrations: illustrations.map(i => ({ path: i.path, start: i.start, end: i.end })),
      threads: deps.threads
    })
    await deps.runFfmpeg(args, { cwd: workDir, timeoutMs: 15 * 60_000 })

    const metrics = await deps.collectMetrics(outPath)
    const qc = evaluateQc(metrics, {
      minSec,
      maxSec,
      title,
      titleMaxLines: ctx.style.title.maxLines,
      titleMaxCharsPerLine: 24,
      texts: words.map(w => w.text),
      names: [...ctx.style.names, ctx.channelName]
    })
    if (!qc.passed) throw new QcFailedError(qc)

    const { caption, hashtags } = buildCaption({
      title,
      hook: ctx.hook ?? undefined,
      channelName: ctx.channelName,
      category: ctx.category ?? undefined,
      keywords: ctx.settings.keywords
    })
    return { outputPath: outPath, title, caption, hashtags, plan, illustrations, qc }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
