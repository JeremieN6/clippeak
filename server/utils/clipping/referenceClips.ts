import type { TwitchClip } from './twitchApi.ts'
import { normalizeWord } from './assBuilder.ts'

export interface ReferenceClip {
  id: string
  title: string
  viewCount: number
  durationSec: number
  // Categorie (jeu, ou "general" sans jeu) : sert au classement par thematique.
  category: string
}

export interface TopicWeight {
  word: string
  weight: number
}

export interface CategoryStat {
  name: string
  clips: number
  avgViews: number
}

export interface ReferenceProfile {
  clipCount: number
  medianViews: number
  topics: TopicWeight[]
  categories: CategoryStat[]
}

const STOPWORDS = new Set([
  'avec', 'dans', 'pour', 'plus', 'sans', 'sous', 'tout', 'tous', 'mais', 'donc', 'cette', 'comme', 'elle', 'elles', 'nous', 'vous', 'leur',
  'quand', 'quoi', 'fait', 'faire', 'etre', 'avoir', 'tres', 'bien', 'trop', 'cest', 'jai', 'les', 'des', 'une', 'que', 'qui', 'est', 'sur', 'pas', 'son', 'ses'
])

export function toReferenceClips(clips: TwitchClip[], gameNames: Map<string, string>): ReferenceClip[] {
  return clips.map(c => ({
    id: c.id,
    title: c.title,
    viewCount: c.viewCount,
    durationSec: c.durationSec,
    category: (c.gameId && gameNames.get(c.gameId)) || 'general'
  }))
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Resume la banque de reference : sujets qui reviennent dans les clips les plus vus (pondere par les vues)
// et performance moyenne par categorie.
export function buildReferenceProfile(clips: ReferenceClip[], maxTopics = 30): ReferenceProfile {
  const weights = new Map<string, number>()
  const totalViews = clips.reduce((sum, c) => sum + c.viewCount, 0) || 1
  for (const clip of clips) {
    const share = clip.viewCount / totalViews
    const seen = new Set<string>()
    for (const raw of clip.title.split(/\s+/)) {
      const word = normalizeWord(raw)
      if (word.length < 4 || STOPWORDS.has(word) || seen.has(word)) continue
      seen.add(word)
      weights.set(word, (weights.get(word) ?? 0) + share)
    }
  }
  const topics = [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTopics)
    .map(([word, weight]) => ({ word, weight: Math.round(weight * 1000) / 1000 }))

  const byCategory = new Map<string, number[]>()
  for (const clip of clips) byCategory.set(clip.category, [...(byCategory.get(clip.category) ?? []), clip.viewCount])
  const categories = [...byCategory.entries()]
    .map(([name, views]) => ({ name, clips: views.length, avgViews: Math.round(views.reduce((a, b) => a + b, 0) / views.length) }))
    .sort((a, b) => b.avgViews - a.avgViews)

  return { clipCount: clips.length, medianViews: median(clips.map(c => c.viewCount)), topics, categories }
}

export interface ReferenceRating {
  adjustedScore: number
  // > 1 : la categorie surperforme la moyenne de la banque ; < 1 : elle sous-performe.
  categoryRatio: number
  matchedTopics: string[]
}

// Ajuste la note d'un moment avec la banque de reference :
// - sujets : jusqu'a +1,5 point si le texte reprend des sujets des clips les plus vus ;
// - categorie : la note est ponderee entre 0,85 et 1,15 selon la performance relative de la categorie.
// Un clip faible en vues absolues peut ainsi rester interessant pour sa categorie (et inversement).
export function rateAgainstReference(score: number, category: string, text: string, profile: ReferenceProfile): ReferenceRating {
  if (!profile.clipCount) return { adjustedScore: score, categoryRatio: 1, matchedTopics: [] }

  const words = new Set(text.split(/\s+/).map(normalizeWord).filter(w => w.length >= 4))
  const matched = profile.topics.filter(t => words.has(t.word))
  const maxWeight = profile.topics[0]?.weight || 1
  const topicBoost = Math.min(1.5, matched.reduce((sum, t) => sum + t.weight / maxWeight, 0) * 0.5)

  const overall = profile.categories.reduce((sum, c) => sum + c.avgViews * c.clips, 0) / profile.clipCount || 1
  const stat = profile.categories.find(c => c.name === category)
  const categoryRatio = stat ? Math.round((stat.avgViews / overall) * 100) / 100 : 1
  const multiplier = Math.min(1.15, Math.max(0.85, 0.85 + (categoryRatio / 2) * 0.3))

  const adjustedScore = Math.round(Math.min(10, Math.max(0, (score + topicBoost) * multiplier)) * 10) / 10
  return { adjustedScore, categoryRatio, matchedTopics: matched.map(t => t.word) }
}
