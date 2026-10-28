import { normalizeWord } from './assBuilder.ts'

export interface CaptionInput {
  title: string
  hook?: string
  // Sert seulement a ne JAMAIS en faire un hashtag (le streamer ne veut pas de tag a son nom).
  channelName?: string
  category?: string
  // Hashtags ajoutes par le streamer dans ses reglages : 2 au plus, toujours en tete.
  streamerTags?: string[]
  // Nombre de hashtags tires du clip (categorie, sujet). 3 au plus.
  maxClipTags?: number
}

const MAX_STREAMER_TAGS = 2
const GENERIC_CATEGORIES = new Set(['general', 'autre', 'other'])
// Mots trop courants pour faire un bon hashtag (le sujet du clip doit ressortir).
const TOPIC_STOP = new Set([
  'alors', 'aussi', 'avec', 'cette', 'comme', 'dans', 'donc', 'elle', 'etait', 'faire', 'fait', 'mais', 'meme', 'nous', 'pour', 'quand', 'sont',
  'tout', 'tous', 'vraiment', 'voila', 'parce', 'apres', 'avant', 'encore', 'ensuite', 'cest', 'vous', 'leur', 'leurs', 'quoi', 'genre', 'chose',
  'jamais', 'toujours', 'hier', 'aujourdhui', 'maintenant', 'juste', 'peut', 'avoir', 'etre', 'celui', 'entre', 'sans', 'tres'
])

function toHashtag(text: string): string | null {
  const tag = normalizeWord(text)
  return tag.length >= 3 && tag.length <= 30 ? `#${tag}` : null
}

// Sujets du clip : mots longs du titre puis de l'accroche, sans doublon, sans mot courant.
function topicWords(text: string): string[] {
  return text.split(/\s+/).map(normalizeWord).filter(w => w.length >= 5 && !TOPIC_STOP.has(w))
}

// Legende + hashtags (heuristique ; une version LLM peut la remplacer sans changer la forme du resultat).
// Hashtags : d'abord 0 a 2 du streamer, puis 1 a 3 lies au clip (categorie, sujet). Ni nom de chaine, ni mots du chat,
// ni etiquettes generiques (#twitch, #fyp...).
export function buildCaption(input: CaptionInput): { caption: string, hashtags: string[] } {
  const hashtags: string[] = []
  const channel = normalizeWord(input.channelName ?? '')
  const add = (candidate: string) => {
    const tag = toHashtag(candidate)
    if (tag && tag.slice(1) !== channel && !hashtags.includes(tag)) { hashtags.push(tag); return true }
    return false
  }

  for (const own of (input.streamerTags ?? []).slice(0, MAX_STREAMER_TAGS)) add(own)

  const maxClip = input.maxClipTags ?? 3
  const before = hashtags.length
  const category = input.category && !GENERIC_CATEGORIES.has(normalizeWord(input.category)) ? input.category : ''
  const candidates = [category, ...topicWords(input.title), ...topicWords(input.hook ?? '')]
  for (const candidate of candidates) {
    if (hashtags.length - before >= maxClip) break
    add(candidate)
  }

  const hook = input.hook?.trim()
  const lines = [input.title.trim(), hook && hook.toLowerCase() !== input.title.trim().toLowerCase() ? hook : ''].filter(Boolean)
  return { caption: `${lines.join('\n')}\n\n${hashtags.join(' ')}`.trim(), hashtags }
}
