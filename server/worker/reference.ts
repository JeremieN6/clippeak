import { randomUUID } from 'node:crypto'
import { mkdir, readdir, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readEnv } from '../utils/env'
import { prisma } from '../utils/prisma'
import { retrying } from '../utils/clipping/dbRetry'
import { dataDir, safeResolve } from '../utils/clipping/dataDir'
import { createPrismaReferenceStore } from '../utils/clipping/prismaReferenceStore'
import { createReferenceStep } from '../utils/clipping/referencePipeline'
import { analyzeReference, localAnalysis } from '../utils/clipping/referenceAnalysis'
import { extractReferenceAudio, extractReferenceFrames, probeDuration } from '../utils/clipping/referenceMedia'
import { transcribeWav } from '../utils/clipping/whisperTranscribe'
import { accountArgs, downloadArgs, metadataArgs, parseAccountEntries, parseYtDlpMeta, runYtDlp, YtDlpError } from '../utils/clipping/ytdlp'

const store = retrying(createPrismaReferenceStore(prisma), { onRetry: (error, attempt) => console.warn(`[worker] base injoignable (tentative ${attempt}), nouvel essai`) })

export const referenceStep = createReferenceStep(store, {
  async expandAccount(url) {
    const json = JSON.parse(await runYtDlp(accountArgs(url, 30), { timeoutMs: 3 * 60_000 }))
    return parseAccountEntries(json, 30)
  },

  async download(job) {
    if (!job.url) throw new YtDlpError('Adresse manquante')
    const dir = join(dataDir(), 'reference', 'tmp')
    await mkdir(dir, { recursive: true })
    const base = randomUUID()
    const meta = parseYtDlpMeta(JSON.parse(await runYtDlp(metadataArgs(job.url), { timeoutMs: 60_000 })))
    await runYtDlp(downloadArgs(job.url, join(dir, `${base}.%(ext)s`)), { timeoutMs: 5 * 60_000 })
    const file = (await readdir(dir)).find(name => name.startsWith(`${base}.`))
    if (!file) throw new YtDlpError('Telechargement vide (clip trop long, trop lourd ou indisponible)')
    return { absolutePath: join(dir, file), meta }
  },

  uploadedPath: job => safeResolve(dataDir(), job.filePath ?? ''),
  probeDuration: path => probeDuration(path),
  extractAudio: (video, wav) => extractReferenceAudio(video, wav),
  async transcribe(wav) {
    const result = await transcribeWav(wav)
    return result.segments.map(s => s.text).join(' ')
  },
  extractFrames: (video, duration) => extractReferenceFrames(video, duration, index => join(tmpdir(), `clippeak-ref-${randomUUID()}-${index}.jpg`)),
  async analyze(input) {
    const apiKey = readEnv('ANTHROPIC_API_KEY')
    return apiKey ? analyzeReference(input, { apiKey, model: readEnv('CLIPPEAK_LLM_MODEL') || undefined }) : localAnalysis(input)
  },
  tempWavPath: () => join(tmpdir(), `clippeak-ref-${randomUUID()}.wav`),
  removeFile: unlink
}, (message, detail) => (detail === undefined ? console.info('[worker]', message) : console.error('[worker]', message, detail)))
