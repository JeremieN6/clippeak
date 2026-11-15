import type { TranscriptResult } from './whisperTranscribe.ts'

export type TranscribeProvider = 'groq' | 'local'

export interface AutoDeps {
  // Service externe (cle GROQ_API_KEY) : absent = Whisper local seul.
  remote?: ((wavPath: string) => Promise<TranscriptResult>) | null
  local: (wavPath: string) => Promise<TranscriptResult>
  onFallback?: (error: unknown) => void
}

// Le service externe d'abord (rapide, ne charge pas le serveur) ; s'il echoue (panne, quota), Whisper local prend le relais pour cette tranche.
export async function transcribeAuto(wavPath: string, deps: AutoDeps): Promise<{ result: TranscriptResult, provider: TranscribeProvider }> {
  if (deps.remote) {
    try {
      return { result: await deps.remote(wavPath), provider: 'groq' }
    } catch (error) {
      deps.onFallback?.(error)
    }
  }
  return { result: await deps.local(wavPath), provider: 'local' }
}
