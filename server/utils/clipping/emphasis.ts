// Choix automatique des mots a mettre en couleur dans les sous-titres : le streamer n'a rien a saisir, un mot important change
// d'un clip a l'autre. Trois indices, tous calcules sur la transcription mot a mot :
//   1. comment c'est dit : mot etire, ou dit juste apres une pause (le streamer le met en avant a l'oral) ;
//   2. ce que c'est : chiffre ou montant, mot fort (jamais, personne, incroyable...), mot long ;
//   3. jamais un mot de remplissage ni un mot vide (le, avec, alors, euh...).
// 1 a 3 mots par phrase au plus, jamais deux mots voisins : si tout est en couleur, plus rien ne ressort.

export type EmphasisLevel = 'off' | 'low' | 'normal' | 'high'

export interface EmphasisWord {
  start: number
  end: number
  text: string
}

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

const EMPTY_WORDS = new Set([
  'alors', 'aussi', 'avec', 'avoir', 'bah', 'ben', 'bon', 'bref', 'cela', 'celui', 'cette', 'chose', 'comme', 'comment', 'dans', 'donc', 'dont',
  'elle', 'elles', 'enfin', 'entre', 'etait', 'etre', 'fait', 'faire', 'fois', 'genre', 'hein', 'euh', 'heu', 'hum', 'ils', 'juste', 'leur', 'leurs',
  'mais', 'meme', 'nous', 'ouais', 'pour', 'pourquoi', 'puis', 'quand', 'quoi', 'sans', 'sont', 'tres', 'voila', 'vous', 'vraiment', 'peut', 'veux',
  'veut', 'truc', 'trucs', 'mdr', 'ptdr', 'lol', 'tout', 'tous', 'toute', 'toutes', 'sinon', 'ensuite', 'apres', 'avant', 'encore', 'parce', 'cest'
])

// Mots qui portent une idee forte quand on les entend.
const STRONG_WORDS = new Set([
  'jamais', 'toujours', 'personne', 'rien', 'incroyable', 'enorme', 'folle', 'fou', 'dingue', 'impossible', 'serieux', 'serieusement', 'vrai', 'faux',
  'arnaque', 'scandale', 'honte', 'gratuit', 'millions', 'million', 'milliers', 'milliard', 'euros', 'dollars', 'argent', 'mort', 'peur', 'secret',
  'interdit', 'unique', 'premier', 'dernier', 'impossible', 'genial', 'horrible', 'terrible', 'magnifique', 'catastrophe', 'ridicule', 'enervant'
])

interface Candidate {
  index: number
  score: number
}

const LEVELS: Record<Exclude<EmphasisLevel, 'off'>, { threshold: number, perSentence: number, longPerSentence: number, maxShare: number }> = {
  low: { threshold: 0.55, perSentence: 1, longPerSentence: 1, maxShare: 0.1 },
  normal: { threshold: 0.4, perSentence: 1, longPerSentence: 2, maxShare: 0.16 },
  high: { threshold: 0.28, perSentence: 2, longPerSentence: 3, maxShare: 0.24 }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function lexicalScore(norm: string, raw: string): number {
  if (/\d/.test(raw)) return 1
  if (STRONG_WORDS.has(norm)) return 1
  if (norm.length >= 9) return 0.55
  if (norm.length >= 7) return 0.35
  return 0.1
}

// Indices (dans `words`) des mots a mettre en valeur.
export function pickEmphasisWords(words: EmphasisWord[], level: EmphasisLevel): Set<number> {
  const chosen = new Set<number>()
  if (level === 'off' || words.length < 3) return chosen
  const rule = LEVELS[level]

  // Phrases : une pause d'au moins 0,5 s ou une ponctuation forte ferme la phrase.
  const sentences: number[][] = []
  let current: number[] = []
  words.forEach((word, i) => {
    current.push(i)
    const gapAfter = i + 1 < words.length ? words[i + 1].start - word.end : Infinity
    if (gapAfter >= 0.5 || /[.!?…]$/.test(word.text.trim())) {
      sentences.push(current)
      current = []
    }
  })
  if (current.length) sentences.push(current)

  const selected: Candidate[] = []
  for (const sentence of sentences) {
    const candidates: Candidate[] = []
    for (const i of sentence) {
      const word = words[i]
      const norm = normalize(word.text)
      if (!norm || EMPTY_WORDS.has(norm)) continue
      const hasDigit = /\d/.test(word.text)
      if (norm.length < 4 && !hasDigit) continue

      // Indice 1 : mot etire (duree bien superieure a celle attendue pour sa longueur) et pause avant le mot.
      const expected = Math.max(0.15, 0.065 * norm.length)
      const stretch = clamp01(((word.end - word.start) / expected - 1.25) / 1.25)
      const previous = i > 0 ? words[i - 1] : null
      const gap = previous ? word.start - previous.end : 0
      const pause = gap >= 0.35 ? 1 : gap >= 0.2 ? 0.5 : 0

      const score = 0.4 * stretch + 0.25 * pause + 0.35 * lexicalScore(norm, word.text)
      if (score >= rule.threshold) candidates.push({ index: i, score })
    }
    const limit = sentence.length >= 12 ? rule.longPerSentence : rule.perSentence
    // Les mieux notes d'abord, sans deux mots voisins, dans la limite de la phrase.
    const kept: Candidate[] = []
    for (const candidate of candidates.sort((x, y) => y.score - x.score)) {
      if (kept.length >= limit) break
      if (kept.some(k => Math.abs(k.index - candidate.index) < 2)) continue
      kept.push(candidate)
    }
    selected.push(...kept)
  }

  // Jamais deux mots voisins ; au plus maxShare des mots du clip, les mieux notes d'abord.
  const cap = Math.max(1, Math.floor(words.length * rule.maxShare))
  for (const candidate of selected.sort((a, b) => b.score - a.score)) {
    if (chosen.size >= cap) break
    if (chosen.has(candidate.index - 1) || chosen.has(candidate.index + 1)) continue
    chosen.add(candidate.index)
  }
  return chosen
}
