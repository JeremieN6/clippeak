import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { buildLongRenderArgs, evaluateLongQc, validateLongRange } from './longExtract.ts'
import type { LongMetrics, LongQcReport } from './longExtract.ts'

export interface LongJobInput {
  jobId: string
  vodTwitchId: string
  startSec: number | null
  endSec: number | null
  maxSec: number
}

export interface LongRenderDeps {
  getVideoUrl: (vodTwitchId: string) => Promise<string>
  runFfmpeg: (args: string[], options?: { timeoutMs?: number }) => Promise<string>
  probe: (path: string) => LongMetrics
  outputDir: string
  threads?: number
}

export class LongQcFailedError extends Error {
  readonly report: LongQcReport
  constructor(report: LongQcReport) {
    super(`Contrôle qualité : ${report.issues.map(i => i.message).join(' ; ')}`)
    this.name = 'LongQcFailedError'
    this.report = report
  }
}

// Rend un extrait long : coupe 16:9 du passage choisi, puis controle. Un extrait qui echoue au controle n'est pas propose a la validation.
export async function renderLongJob(job: LongJobInput, deps: LongRenderDeps): Promise<{ outputPath: string, qc: LongQcReport }> {
  if (job.startSec === null || job.endSec === null) throw new Error('Cet extrait n’a pas de début et de fin : refais-le depuis « Extraits longs ».')
  const problem = validateLongRange({ startSec: job.startSec, endSec: job.endSec, maxSec: job.maxSec })
  if (problem) throw new Error(problem)
  const outPath = join(deps.outputDir, `${job.jobId}.mp4`)
  await mkdir(dirname(outPath), { recursive: true })
  const input = await deps.getVideoUrl(job.vodTwitchId)
  const duration = job.endSec - job.startSec
  await deps.runFfmpeg(buildLongRenderArgs({ input, startSec: job.startSec, durationSec: duration, outPath, threads: deps.threads }), { timeoutMs: 45 * 60_000 })
  const qc = evaluateLongQc(deps.probe(outPath), duration)
  if (!qc.passed) throw new LongQcFailedError(qc)
  return { outputPath: outPath, qc }
}
