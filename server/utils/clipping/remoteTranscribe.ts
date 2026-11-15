import { readFile } from 'node:fs/promises'
import type { TranscriptResult, TranscriptSegment, TranscriptWord } from './whisperTranscribe.ts'

// Transcription par un service externe (Groq, modele whisper-large-v3-turbo, API compatible OpenAI) : l'audio de la tranche (WAV 16 kHz mono,
// 5 minutes = moins de 10 Mo) est envoye a Groq, qui rend les phrases et les mots avec leurs heures. Rapide (centaines de fois le temps reel) :
// c'est ce qui evite de saturer les 2 coeurs du serveur. Cle dans GROQ_API_KEY, jamais journalisee.
export const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
export const GROQ_MODEL = 'whisper-large-v3-turbo'

export class RemoteTranscribeError extends Error {
  readonly retryable: boolean
  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = 'RemoteTranscribeError'
    this.retryable = retryable
  }
}

// Whisper invente parfois du texte sur du silence : on ecarte les phrases qu'il juge lui-meme sans parole.
const NO_SPEECH_MAX = 0.8

export function parseGroqResponse(body: any): TranscriptResult {
  if (!Array.isArray(body?.segments)) throw new RemoteTranscribeError('Réponse de transcription sans segments', true)
  const words: TranscriptWord[] = (Array.isArray(body.words) ? body.words : [])
    .map((w: any) => ({ start: Number(w.start), end: Number(w.end), text: String(w.word ?? w.text ?? '').trim() }))
    .filter((w: TranscriptWord) => w.text && Number.isFinite(w.start) && Number.isFinite(w.end))
  const segments: TranscriptSegment[] = body.segments
    .filter((s: any) => !(Number(s.no_speech_prob) > NO_SPEECH_MAX))
    .map((s: any): TranscriptSegment => {
      const start = Number(s.start)
      const end = Number(s.end)
      const own = words.filter(w => w.start >= start - 0.05 && w.start < end)
      return { start, end, text: String(s.text ?? '').trim(), ...(own.length ? { words: own } : {}) }
    })
    .filter((s: TranscriptSegment) => s.text && Number.isFinite(s.start) && s.end > s.start)
  return { segments, audioSec: Number(body.duration ?? 0), transcribeSec: 0 }
}

export interface RemoteOptions {
  apiKey: string
  model?: string
  fetchFn?: typeof fetch
  timeoutMs?: number
  readFileFn?: (path: string) => Promise<Buffer>
}

export async function transcribeRemote(wavPath: string, options: RemoteOptions): Promise<TranscriptResult> {
  const doFetch = options.fetchFn ?? fetch
  const audio = await (options.readFileFn ?? readFile)(wavPath)
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'audio.wav')
  form.append('model', options.model ?? GROQ_MODEL)
  form.append('language', 'fr')
  form.append('response_format', 'verbose_json')
  form.append('temperature', '0')
  form.append('timestamp_granularities[]', 'word')
  form.append('timestamp_granularities[]', 'segment')

  const started = Date.now()
  let response: Response
  try {
    response = await doFetch(GROQ_URL, { method: 'POST', headers: { authorization: `Bearer ${options.apiKey}` }, body: form, signal: AbortSignal.timeout(options.timeoutMs ?? 120_000) })
  } catch {
    throw new RemoteTranscribeError('Le service de transcription est injoignable', true)
  }
  if (!response.ok) {
    const auth = response.status === 401 || response.status === 403
    throw new RemoteTranscribeError(auth ? 'La clé du service de transcription est refusée' : `Le service de transcription a répondu HTTP ${response.status}`, !auth && (response.status === 429 || response.status >= 500))
  }
  const result = parseGroqResponse(await response.json())
  return { ...result, transcribeSec: (Date.now() - started) / 1000 }
}
