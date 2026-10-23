import { normalizeWord } from './assBuilder.ts'

export interface CaptionInput {
  title: string
  hook?: string
  channelName: string
  category?: string
  // Mots-cles du streamer ou du moment ; les plus parlants deviennent des hashtags.
  keywords?: string[]
  extraHashtags?: string[]
  maxHashtags?: number
}

const BASE_HASHTAGS = ['twitch', 'clip', 'fyp']

function toHashtag(text: string): string | null {
  const tag = normalizeWord(text)
  return tag.length >= 3 && tag.length <= 30 ? `#${tag}` : null
}

// Legende + hashtags (heuristique ; une version LLM peut la remplacer sans changer la forme du resultat).
export function buildCaption(input: CaptionInput): { caption: string, hashtags: string[] } {
  const max = input.maxHashtags ?? 8
  const candidates = [input.channelName, input.category ?? '', ...(input.keywords ?? []), ...(input.extraHashtags ?? []), ...BASE_HASHTAGS]
  const hashtags: string[] = []
  for (const candidate of candidates) {
    const tag = toHashtag(candidate)
    if (tag && !hashtags.includes(tag)) hashtags.push(tag)
    if (hashtags.length >= max) break
  }
  const hook = input.hook?.trim()
  const lines = [input.title.trim(), hook && hook.toLowerCase() !== input.title.trim().toLowerCase() ? hook : ''].filter(Boolean)
  return { caption: `${lines.join('\n')}\n\n${hashtags.join(' ')}`.trim(), hashtags }
}
