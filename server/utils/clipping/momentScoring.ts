import type { ChatPeak } from './chatPeaks.ts'
import type { PeakTranscript } from './peakTranscript.ts'

export interface MomentCandidate {
  peak: ChatPeak
  transcript: PeakTranscript
}

export type MomentKind = 'story' | 'opinion' | 'punchline' | 'other'

export interface MomentScore {
  // Potentiel de viralite sur 10.
  score: number
  kind: MomentKind
  hook: string
  category: string
  summary: string
  rationale: string
  scorer: 'heuristic' | 'claude'
}

export interface MomentScorer {
  score(candidate: MomentCandidate): Promise<MomentScore>
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const round1 = (n: number) => Math.round(n * 10) / 10

const STORY = /\b(un jour|hier|l'autre jour|quand j'etais|j'ai raconte|en fait|alors|du coup|je te jure|devine)\b/i
const OPINION = /\b(je pense|franchement|honnetement|pour moi|a mon avis|c'est nul|c'est le meilleur|jamais|toujours|personne|tout le monde)\b/i
const PUNCHLINE = /\b(mdr|ptdr|lol|trop fort|grave|n'importe quoi|sérieux|serieux)\b|[!?]{2,}/i

function plain(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Note locale, sans API : melange l'intensite du chat (60 %) et la richesse de ce qui est dit juste avant le pic (40 %).
// Sert de repli quand aucune cle d'API n'est configuree ou quand l'appel echoue.
export function heuristicScore(candidate: MomentCandidate): MomentScore {
  const before = plain(candidate.transcript.beforePeak)
  const words = before.split(/\s+/).filter(Boolean).length

  let content = 0
  const story = STORY.test(before)
  const opinion = OPINION.test(before)
  const punch = PUNCHLINE.test(before)
  if (words >= 25) content += 4
  else if (words >= 10) content += 2
  if (story) content += 3
  if (opinion) content += 2
  if (punch) content += 1
  content = clamp(content, 0, 10)

  const score = round1(clamp(candidate.peak.score * 0.6 + content * 0.4, 0, 10))
  const kind: MomentKind = story ? 'story' : opinion ? 'opinion' : punch ? 'punchline' : 'other'
  const hook = candidate.transcript.segments.find(s => s.start < candidate.peak.peakSec)?.text ?? ''
  return {
    score,
    kind,
    hook,
    category: 'general',
    summary: candidate.transcript.beforePeak.slice(0, 160),
    rationale: `chat ${candidate.peak.score}/10 (${candidate.peak.signals.messages} messages), ${words} mots avant le pic${story ? ', recit' : ''}${opinion ? ', avis' : ''}`,
    scorer: 'heuristic'
  }
}

export const heuristicScorer: MomentScorer = { score: async candidate => heuristicScore(candidate) }

const SYSTEM_PROMPT = [
  'Tu es monteur de clips verticaux (TikTok, Reels, Shorts) pour un streamer Twitch francophone.',
  'On te donne ce que dit le streamer juste avant un pic de reactions du chat, et des stats du chat.',
  'Garde les vraies histoires, les avis tranches et les punchlines ; ecarte le bavardage sans enjeu.',
  'Reponds uniquement par un objet JSON : {"score": nombre de 0 a 10 (potentiel de viralite), "kind": "story"|"opinion"|"punchline"|"other",',
  '"hook": phrase d\'accroche d\'au plus 12 mots tiree du texte, "category": un mot (ex: relations, jeu, actu, humour),',
  '"summary": une phrase, "rationale": une phrase sur le choix de la note}.'
].join(' ')

export interface ClaudeScorerOptions {
  apiKey: string
  model?: string
  fetchFn?: typeof fetch
  fallback?: MomentScorer
}

function extractJson(text: string): any {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Reponse du modele sans JSON')
  return JSON.parse(text.slice(start, end + 1))
}

// Notation par l'API Claude (cle dans ANTHROPIC_API_KEY, jamais journalisee). Toute erreur reseau ou de format
// bascule sur la note locale : un clip n'est jamais perdu parce que l'API est indisponible.
export function createClaudeScorer(options: ClaudeScorerOptions): MomentScorer {
  const doFetch = options.fetchFn ?? fetch
  const fallback = options.fallback ?? heuristicScorer
  const model = options.model ?? 'claude-sonnet-5-5'

  return {
    async score(candidate) {
      try {
        const response = await doFetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': options.apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model,
            max_tokens: 400,
            system: SYSTEM_PROMPT,
            messages: [{
              role: 'user',
              content: `Chat : ${candidate.peak.signals.messages} messages, score de pic ${candidate.peak.score}/10, part de mots-cles ${candidate.peak.signals.keywordShare}.\nCe que dit le streamer avant le pic :\n"""${candidate.transcript.beforePeak.slice(0, 1500)}"""`
            }]
          })
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body = await response.json() as any
        const text = (body?.content ?? []).map((block: any) => block?.text ?? '').join('')
        const data = extractJson(text)
        const kinds: MomentKind[] = ['story', 'opinion', 'punchline', 'other']
        return {
          score: round1(clamp(Number(data.score), 0, 10)),
          kind: kinds.includes(data.kind) ? data.kind : 'other',
          hook: String(data.hook ?? '').slice(0, 200),
          category: String(data.category ?? 'general').slice(0, 60),
          summary: String(data.summary ?? '').slice(0, 300),
          rationale: String(data.rationale ?? '').slice(0, 300),
          scorer: 'claude'
        } satisfies MomentScore
      } catch {
        return fallback.score(candidate)
      }
    }
  }
}
