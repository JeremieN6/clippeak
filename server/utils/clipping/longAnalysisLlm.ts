import { parseCandidates, systemPrompt } from './longAnalysis.ts'
import type { Candidate } from './longAnalysis.ts'
import { trackAnthropicResponse } from './opsCost.ts'

export interface LongLlmOptions {
  apiKey: string
  model?: string
  fetchFn?: typeof fetch
  // Pour les tests : pas d'envoi de cout a Sassify Ops.
  track?: (body: unknown, request: unknown) => void
}

export class LongLlmError extends Error {
  readonly retryable: boolean
  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = 'LongLlmError'
    this.retryable = retryable
  }
}

// Cherche les passages d'une fenetre de transcription avec l'API Claude (cle dans ANTHROPIC_API_KEY, jamais journalisee). Contrairement a la
// note des clips, une erreur n'est PAS masquee : l'analyse doit echouer visiblement plutot que de proposer « rien » a cause d'une panne.
export function createLongCandidateFinder(options: LongLlmOptions) {
  const doFetch = options.fetchFn ?? fetch
  const model = options.model ?? 'claude-sonnet-5-5'
  const track = options.track ?? ((body, request) => trackAnthropicResponse('clippeak', body, request, { feature: 'long-analysis' }))

  return async function find(chunk: { text: string, startSec: number, endSec: number }, limits: { minSec: number, maxSec: number }): Promise<Candidate[]> {
    const request = {
      model,
      max_tokens: 2500,
      system: systemPrompt(limits.minSec, limits.maxSec),
      messages: [{ role: 'user', content: `Transcription d'une partie du live :\n\n${chunk.text}` }]
    }
    let response: Response
    try {
      response = await doFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': options.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(request)
      })
    } catch {
      throw new LongLlmError('Claude est injoignable pour le moment', true)
    }
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500
      throw new LongLlmError(response.status === 401 || response.status === 403 ? 'La clé Claude du serveur est refusée' : `Claude a répondu HTTP ${response.status}`, retryable)
    }
    const body = await response.json() as any
    try { track(body, request) } catch { /* le suivi des couts ne doit jamais bloquer l'analyse */ }
    const text = (body?.content ?? []).map((block: any) => block?.text ?? '').join('')
    // Une fenetre sans passage donne un tableau vide : c'est une reponse valable. Une reponse sans tableau du tout est une erreur.
    if (!text.includes('[')) throw new LongLlmError('Claude a répondu dans un format inattendu', true)
    return parseCandidates(text)
  }
}
