import type { ReferenceAnalysis } from './referenceAnalysis.ts'
import { tokenize } from './referenceSimilarity.ts'

export interface ProfileItem {
  id: string
  title: string | null
  viewCount: number | null
  likeCount: number | null
  commentCount: number | null
  shareCount: number | null
  analysis: ReferenceAnalysis | null
  transcript: string
}

const known = (n: number | null): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0

// Score d'audience d'un clip : les vues si on les connait, sinon une combinaison pondere des interactions.
export function audienceScore(item: Pick<ProfileItem, 'viewCount' | 'likeCount' | 'commentCount' | 'shareCount'>): number | null {
  if (known(item.viewCount)) return item.viewCount
  const interactions = [item.likeCount, item.commentCount, item.shareCount].filter(known)
  if (!interactions.length) return null
  return (item.likeCount ?? 0) * 10 + (item.commentCount ?? 0) * 30 + (item.shareCount ?? 0) * 50
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Poids d'un clip dans le profil et dans la ressemblance : 1 sans statistiques (clips tous egaux) ; avec des statistiques,
// de 0,7 (en dessous de la mediane) a 1,4 (tres au-dessus). Jamais d'effet explosif : quelques clips viraux ne doivent pas tout ecraser.
export function performanceWeights(items: ProfileItem[]): Map<string, number> {
  const scores = items.map(audienceScore)
  const valid = scores.filter((s): s is number => s !== null && s > 0)
  const mid = valid.length >= 2 ? median(valid) : 0
  const weights = new Map<string, number>()
  items.forEach((item, i) => {
    const score = scores[i]
    weights.set(item.id, mid > 0 && score !== null ? Math.min(1.4, Math.max(0.7, Math.sqrt(score / mid))) : 1)
  })
  return weights
}

export interface CountedLabel {
  name: string
  count: number
}

export interface ReferenceBankProfile {
  clipCount: number
  analyzedCount: number
  withStats: number
  topics: Array<{ word: string, weight: number }>
  formats: CountedLabel[]
  emotions: CountedLabel[]
  categories: CountedLabel[]
  hooks: Array<{ id: string, title: string | null, hook: string }>
}

function tally(values: string[]): CountedLabel[] {
  const counts = new Map<string, number>()
  for (const v of values.map(x => x.trim().toLowerCase()).filter(Boolean)) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
}

// Resume la banque : sujets recurrents (ponderes par la performance), formats, emotions, categories et meilleures accroches.
export function buildReferenceBankProfile(items: ProfileItem[], maxTopics = 20): ReferenceBankProfile {
  const weights = performanceWeights(items)
  const topicWeights = new Map<string, number>()
  for (const item of items) {
    const weight = weights.get(item.id) ?? 1
    const words = item.analysis?.keywords.length ? item.analysis.keywords : item.transcript.split(/\s+/).filter(w => tokenize(w).length)
    const seen = new Set<string>()
    for (const raw of words) {
      const word = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim()
      if (word.length < 4 || seen.has(word)) continue
      seen.add(word)
      topicWeights.set(word, (topicWeights.get(word) ?? 0) + weight)
    }
  }
  const analyzed = items.filter(i => i.analysis)
  const ranked = [...analyzed].sort((a, b) => (weights.get(b.id) ?? 1) - (weights.get(a.id) ?? 1))
  return {
    clipCount: items.length,
    analyzedCount: analyzed.length,
    withStats: items.filter(i => audienceScore(i) !== null).length,
    topics: [...topicWeights.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxTopics).map(([word, weight]) => ({ word, weight: Math.round(weight * 100) / 100 })),
    formats: tally(analyzed.map(i => i.analysis!.format)),
    emotions: tally(analyzed.map(i => i.analysis!.emotion)),
    categories: tally(analyzed.map(i => i.analysis!.category)),
    hooks: ranked.filter(i => i.analysis!.hook).slice(0, 8).map(i => ({ id: i.id, title: i.title, hook: i.analysis!.hook }))
  }
}
