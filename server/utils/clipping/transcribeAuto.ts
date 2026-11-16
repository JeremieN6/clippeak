import type { TranscriptResult } from './whisperTranscribe.ts'

export type TranscribeProvider = 'groq' | 'local'
// Causes d'echec du service externe qui ont leur propre conduite (alerte, attente) ; « other » reste un echec ordinaire.
export type GroqCause = 'key' | 'rate' | 'outage'

export interface AutoDeps {
  // Service externe (cle GROQ_API_KEY) : absent = pas de service externe.
  remote?: ((wavPath: string) => Promise<TranscriptResult>) | null
  local: (wavPath: string) => Promise<TranscriptResult>
  // Repli sur Whisper local : SEULEMENT si autorise (WORKER_LOCAL_FALLBACK=1). Le serveur n'a que 2 coeurs : pendant une tranche locale (jusqu'a
  // 20 min) il ne rend plus aucun clip, donc par defaut un echec du service externe n'est PAS rattrape en local, il remonte a l'appelant.
  localFallback?: boolean
  // Appelee a chaque echec du service externe (alerte admin, journal), que le repli soit permis ou non.
  onRemoteError?: (error: unknown) => void
}

export async function transcribeAuto(wavPath: string, deps: AutoDeps): Promise<{ result: TranscriptResult, provider: TranscribeProvider }> {
  if (deps.remote) {
    try {
      return { result: await deps.remote(wavPath), provider: 'groq' }
    } catch (error) {
      deps.onRemoteError?.(error)
      if (!deps.localFallback) throw error
    }
  } else if (!deps.localFallback) {
    throw new Error('Aucun service de transcription configuré (ni clé Groq, ni repli local autorisé)')
  }
  return { result: await deps.local(wavPath), provider: 'local' }
}

// Attente avant de retenter une tranche refusee par le service externe : 5, 10 puis 20 minutes, ou plus si le service le demande (Retry-After),
// sans depasser une heure.
const WAIT_STEPS_MS = [5 * 60_000, 10 * 60_000, 20 * 60_000]
const WAIT_MAX_MS = 60 * 60_000
export function groqWaitMs(attempt: number, retryAfterMs: number | null): number {
  const step = WAIT_STEPS_MS[Math.min(Math.max(Math.trunc(attempt), 1), WAIT_STEPS_MS.length) - 1]!
  return Math.min(Math.max(step, retryAfterMs ?? 0), WAIT_MAX_MS)
}
// Une cle refusee ne se repare pas toute seule : on ne redemande qu'une fois par demi-heure.
export const GROQ_KEY_WAIT_MS = 30 * 60_000

// Marque ecrite dans vod_transcripts.error : le live attend le service externe (l'onglet « Capacite » les compte). Effacee par la tranche suivante reussie.
export const GROQ_WAIT_PREFIX = 'groq:'
const WAIT_TEXT: Record<GroqCause, string> = {
  key: 'La clé du service de transcription (Groq) est refusée : la lecture de ce live est arrêtée tant que la clé n’est pas corrigée.',
  rate: 'Le service de transcription (Groq) limite le débit : la lecture de ce live reprend dans quelques minutes.',
  outage: 'Le service de transcription (Groq) est en panne : la lecture de ce live reprend dans quelques minutes.'
}
export const groqWaitNote = (cause: GroqCause): string => `${GROQ_WAIT_PREFIX}${cause}:${WAIT_TEXT[cause]}`
export const isGroqWaitNote = (error: string | null | undefined): boolean => Boolean(error?.startsWith(GROQ_WAIT_PREFIX))

// Message a l'admin (Telegram / Discord). Jamais de cle ni d'adresse, seulement la cause et la conduite du serveur.
export function groqAlertMessage(cause: GroqCause, localFallback: boolean): string {
  const base = {
    key: 'Clippeak : la clé Groq est refusée (GROQ_API_KEY). La détection par le contenu est à l’arrêt tant que la clé n’est pas corrigée.',
    rate: 'Clippeak : Groq limite le débit (limite d’audio atteinte). Les tranches attendent 5, 10 puis 20 minutes avant un nouvel essai.',
    outage: 'Clippeak : Groq est injoignable ou en panne. Les tranches attendent 5, 10 puis 20 minutes avant un nouvel essai.'
  }[cause]
  return `${base} ${localFallback ? 'Le repli sur le serveur (Whisper local) est activé : il prend le relais, le rendu des clips peut ralentir.' : 'Le serveur ne transcrit pas lui-même (repli local désactivé), le rendu des clips n’est pas touché.'}`
}

// Une alerte par cause et par heure (un Groq en panne ne doit pas remplir le telephone de l'admin).
export function createAlertThrottle(intervalMs: number = 60 * 60_000) {
  const last = new Map<string, number>()
  return {
    shouldAlert(cause: string, nowMs: number = Date.now()): boolean {
      const before = last.get(cause)
      if (before !== undefined && nowMs - before < intervalMs) return false
      last.set(cause, nowMs)
      return true
    }
  }
}
