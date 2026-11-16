import { detectionPrompt, parseContentCandidates } from './contentDetection.ts'
import type { ContentCandidate, ContentWindow } from './contentDetection.ts'
import { LongLlmError } from './longAnalysisLlm.ts'
import { trackAnthropicResponse } from './opsCost.ts'

export interface ContentLlmOptions {
  apiKey: string
  model?: string
  styleNotes?: string
  fetchFn?: typeof fetch
  // Pour les tests : pas d'envoi de cout a Sassify Ops.
  track?: (body: unknown, request: unknown) => void
}

// Cherche les moments d'une fenetre de transcription avec l'API Claude (cle dans ANTHROPIC_API_KEY, jamais journalisee). Comme pour les extraits
// longs, une erreur n'est PAS masquee : mieux vaut une detection qui echoue visiblement que « aucun moment » a cause d'une panne.
export function createContentFinder(options: ContentLlmOptions) {
  const doFetch = options.fetchFn ?? fetch
  const model = options.model ?? 'claude-sonnet-5-5'
  const track = options.track ?? ((body, request) => trackAnthropicResponse('clippeak', body, request, { feature: 'content-detection' }))

  return async function find(window: ContentWindow): Promise<ContentCandidate[]> {
    const request = {
      model,
      max_tokens: 3000,
      system: detectionPrompt(undefined, undefined, { styleNotes: options.styleNotes }),
      messages: [{ role: 'user', content: `Transcription d'une partie du live :\n\n${window.text}` }]
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
      throw new LongLlmError(response.status === 401 || response.status === 403 ? 'La clé Claude du serveur est refusée' : `Claude a répondu HTTP ${response.status}`, response.status === 429 || response.status >= 500)
    }
    const body = await response.json() as any
    try { track(body, request) } catch { /* le suivi des couts ne doit jamais bloquer la detection */ }
    const text = (body?.content ?? []).map((block: any) => block?.text ?? '').join('')
    if (!text.includes('[')) throw new LongLlmError('Claude a répondu dans un format inattendu', true)
    return parseContentCandidates(text)
  }
}
