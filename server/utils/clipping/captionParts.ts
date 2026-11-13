// La legende d'un clip contient le texte puis, a la fin, une ligne de hashtags (voir buildCaption). Le studio les montre dans deux champs :
// « Légende » et « Hashtags ». Fichier pur : sert a la page du studio.

const TAG = /^#[\p{L}\p{N}_]+$/u

export interface CaptionParts { text: string, hashtags: string }

// Separe la legende : le dernier paragraphe, s'il n'est fait que de hashtags, devient le champ « Hashtags ».
export function splitCaption(caption: string | null | undefined): CaptionParts {
  const value = (caption ?? '').replace(/\r\n/g, '\n').trim()
  if (!value) return { text: '', hashtags: '' }
  const paragraphs = value.split(/\n{2,}/)
  const last = paragraphs[paragraphs.length - 1].trim()
  const words = last.split(/\s+/).filter(Boolean)
  if (words.length && words.every(w => TAG.test(w))) return { text: paragraphs.slice(0, -1).join('\n\n').trim(), hashtags: words.join(' ') }
  // Une legende d'une seule ligne de hashtags (sans texte) est aussi reconnue.
  return { text: value, hashtags: '' }
}

// Normalise ce que tape le streamer dans « Hashtags » : mots separes par des espaces ou des virgules, « # » ajoute si besoin, doublons retires.
export function normalizeHashtags(raw: string): string {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const part of raw.split(/[\s,;]+/)) {
    const word = part.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '')
    if (!word) continue
    const tag = `#${word}`
    if (!seen.has(tag.toLowerCase())) { seen.add(tag.toLowerCase()); tags.push(tag) }
  }
  return tags.join(' ')
}

// Recompose la legende envoyee : texte, ligne vide, hashtags.
export function joinCaption(text: string, hashtags: string): string {
  return [text.trim(), normalizeHashtags(hashtags)].filter(Boolean).join('\n\n')
}
