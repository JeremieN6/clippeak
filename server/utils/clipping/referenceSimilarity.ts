// Ressemblance entre le texte d'un moment candidat (live ou VOD) et les transcriptions des clips de reference :
// TF-IDF + cosinus, local et deterministe (aucune API, aucun cout). Un jugement plus fin par Claude peut s'ajouter apres.

const STOPWORDS = new Set([
  'alors', 'aussi', 'avec', 'avoir', 'bah', 'bon', 'ben', 'bref', 'cela', 'celui', 'ces', 'cet', 'cette', 'chose', 'comme', 'comment',
  'dans', 'des', 'donc', 'dont', 'elle', 'elles', 'enfin', 'entre', 'est', 'etait', 'etaient', 'etais', 'etre', 'avait', 'avaient', 'serait', 'seront', 'ete', 'fait', 'faire', 'fois', 'genre', 'han',
  'ils', 'juste', 'les', 'leur', 'leurs', 'lui', 'mais', 'meme', 'mes', 'moi', 'mon', 'nous', 'oui', 'non', 'par', 'pas', 'peu', 'plus',
  'pour', 'pourquoi', 'puis', 'quand', 'que', 'quel', 'quelle', 'qui', 'quoi', 'sans', 'ses', 'sont', 'sur', 'tes', 'toi', 'ton', 'tous',
  'tout', 'toute', 'tres', 'une', 'vais', 'voila', 'vous', 'vraiment', 'ouais', 'euh', 'hein', 'truc', 'trucs', 'peut', 'veux', 'veut'
])

export function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
  // Racine grossiere (6 premieres lettres) : rapproche pluriels et conjugaisons sans dictionnaire.
  return words.filter(w => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w)).map(w => w.slice(0, 6))
}

export interface RefDoc {
  id: string
  text: string
  // Poids de performance (1 = neutre) : un clip tres vu pese davantage dans le classement.
  weight?: number
}

interface Vector {
  id: string
  weight: number
  terms: Map<string, number>
  norm: number
}

export interface Corpus {
  idf: Map<string, number>
  vectors: Vector[]
}

function termFrequencies(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>()
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
  return tf
}

function weigh(tf: Map<string, number>, idf: Map<string, number>): { terms: Map<string, number>, norm: number } {
  const terms = new Map<string, number>()
  let sum = 0
  for (const [term, count] of tf) {
    const value = (1 + Math.log(count)) * (idf.get(term) ?? 1)
    terms.set(term, value)
    sum += value * value
  }
  return { terms, norm: Math.sqrt(sum) }
}

export function buildCorpus(docs: RefDoc[]): Corpus {
  const tokenized = docs.map(d => ({ doc: d, tf: termFrequencies(tokenize(d.text)) }))
  const df = new Map<string, number>()
  for (const { tf } of tokenized) for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1)
  const n = docs.length
  const idf = new Map<string, number>()
  for (const [term, count] of df) idf.set(term, Math.log((n + 1) / (count + 1)) + 1)
  return {
    idf,
    vectors: tokenized.map(({ doc, tf }) => ({ id: doc.id, weight: doc.weight ?? 1, ...weigh(tf, idf) }))
  }
}

export interface SimilarityMatch {
  id: string
  similarity: number
  sharedTerms: string[]
}

export interface SimilarityResult {
  // Meilleure ressemblance (0..1) et les references les plus proches.
  best: number
  matches: SimilarityMatch[]
}

export function similarity(text: string, corpus: Corpus, topK = 3): SimilarityResult {
  const query = weigh(termFrequencies(tokenize(text)), corpus.idf)
  if (!query.norm || !corpus.vectors.length) return { best: 0, matches: [] }

  const matches: SimilarityMatch[] = []
  for (const vector of corpus.vectors) {
    if (!vector.norm) continue
    let dot = 0
    const shared: Array<[string, number]> = []
    for (const [term, value] of query.terms) {
      const other = vector.terms.get(term)
      if (other !== undefined) {
        dot += value * other
        shared.push([term, value * other])
      }
    }
    if (!dot) continue
    matches.push({
      id: vector.id,
      similarity: Math.round((dot / (query.norm * vector.norm)) * 1000) / 1000,
      sharedTerms: shared.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([term]) => term)
    })
  }
  matches.sort((a, b) => b.similarity - a.similarity)
  const top = matches.slice(0, topK)
  return { best: top[0]?.similarity ?? 0, matches: top }
}

export interface SimilarityRating {
  score: number
  boost: number
  best: number
  // Phrase ajoutee a la justification de la note ('' si aucune ressemblance notable).
  note: string
}

// Releve la note d'un moment selon sa ressemblance avec les clips de reference (jamais au-dela de 10).
export function rateBySimilarity(score: number, text: string, corpus: Corpus, titles: Map<string, string> = new Map()): SimilarityRating {
  const result = similarity(text, corpus)
  const top = result.matches[0]
  const weight = top ? (corpus.vectors.find(v => v.id === top.id)?.weight ?? 1) : 1
  const boost = similarityBoost(result.best, weight)
  if (!top || boost <= 0) return { score, boost: 0, best: result.best, note: '' }
  const label = titles.get(top.id) ?? 'un clip de reference'
  return {
    score: Math.min(10, Math.round((score + boost) * 10) / 10),
    boost,
    best: result.best,
    note: `ressemble a "${label.slice(0, 60)}" (${Math.round(result.best * 100)} %, mots communs : ${top.sharedTerms.join(', ')})`
  }
}

// Bonus de note (0 a 2,5 points) selon la ressemblance : rien sous 0,08 (bruit), maximum a partir de 0,35.
export function similarityBoost(best: number, weight = 1): number {
  const scaled = Math.min(1, Math.max(0, (best - 0.08) / (0.35 - 0.08)))
  return Math.round(Math.min(2.5, scaled * 2.5 * Math.min(1.4, Math.max(0.7, weight))) * 10) / 10
}
