import type { TranscriptSegment, TranscriptWord } from './whisperTranscribe.ts'

export interface CutSettings {
  minSec: number
  maxSec: number
  // Pause entre deux mots au-dela de laquelle on coupe ; la pause conservee est ramenee a keepPauseSec.
  maxPauseSec?: number
  keepPauseSec?: number
  // Marge MAXIMALE gardee apres le dernier mot : on laisse respirer la fin (le clip ne s'arrete pas net), sans jamais
  // empieter sur le mot suivant ni garder plus de silence que necessaire.
  tailSec?: number
  // Nombre de phrases gardees apres la chute (2 par defaut) et duree maximale de parole ajoutee ainsi (10 s par defaut).
  afterPhrases?: number
  afterMaxSec?: number
  // Marge avant la premiere syllabe de l'accroche.
  headSec?: number
  // Le chat reagit apres la chute : on accepte des mots finissant jusqu'a graceSec apres le pic.
  graceSec?: number
}

export interface KeepRange {
  start: number
  end: number
}

export interface CutPlan {
  startSec: number
  endSec: number
  // Plages conservees (temps de VOD) une fois les silences retires ; concatenees dans l'ordre.
  keepRanges: KeepRange[]
  durationSec: number
  meetsMin: boolean
  hook: string
  lastWords: string
}

const SENTENCE_END = /[.!?…]$/

// Fin de phrase : ponctuation finale OU pause d'au moins 0,5 s apres le mot (Whisper ponctue peu la parole de stream,
// la pause est alors le seul repere d'une phrase terminee) OU dernier mot de la transcription.
export function phraseEnds(words: TranscriptWord[]): Set<TranscriptWord> {
  const ends = new Set<TranscriptWord>()
  words.forEach((word, i) => {
    const next = words[i + 1]
    if (SENTENCE_END.test(word.text) || !next || next.start - word.end >= 0.5) ends.add(word)
  })
  return ends
}

function flattenWords(segments: TranscriptSegment[]): TranscriptWord[] {
  return segments.flatMap(s => s.words?.length ? s.words : [{ start: s.start, end: s.end, text: s.text }])
}

// Debuts de phrases (temps de VOD) : debut de segment Whisper, ou mot qui suit une fin de phrase
// (ponctuation finale ou pause, voir phraseEnds).
function sentenceStarts(segments: TranscriptSegment[]): number[] {
  const starts = new Set<number>()
  const all = flattenWords(segments).filter(w => w.text)
  const ends = phraseEnds(all)
  all.forEach((word, i) => {
    if (i > 0 && ends.has(all[i - 1])) starts.add(word.start)
  })
  for (const segment of segments) {
    const first = segment.words?.length ? segment.words[0] : { start: segment.start }
    starts.add(first.start)
  }
  return [...starts].sort((x, y) => x - y)
}

// Retire les silences internes : toute pause plus longue que maxPauseSec est reduite a keepPauseSec.
export function trimSilences(words: TranscriptWord[], startSec: number, endSec: number, settings: CutSettings): KeepRange[] {
  const maxPause = settings.maxPauseSec ?? 0.6
  const keepPause = settings.keepPauseSec ?? 0.2
  const inside = words.filter(w => w.end > startSec && w.start < endSec)
  if (!inside.length) return [{ start: startSec, end: endSec }]

  const ranges: KeepRange[] = []
  let current: KeepRange = { start: startSec, end: inside[0].end }
  for (let i = 1; i < inside.length; i++) {
    const gap = inside[i].start - inside[i - 1].end
    if (gap > maxPause) {
      current.end = inside[i - 1].end + keepPause / 2
      ranges.push(current)
      current = { start: inside[i].start - keepPause / 2, end: inside[i].end }
    } else {
      current.end = inside[i].end
    }
  }
  current.end = endSec
  ranges.push(current)
  return ranges.filter(r => r.end - r.start > 0.05)
}

// Choisit l'accroche et la chute autour du pic de chat.
// - La fin est posee juste apres le dernier mot de la phrase qui contient (ou suit) la reaction : on ne finit jamais
//   sur un silence ni sur une image figee, et on ne coupe pas le mot en cours.
// - Le debut recule de phrase en phrase jusqu'a atteindre la duree minimale, sans depasser la duree maximale.
export function planCut(segments: TranscriptSegment[], peakSec: number, settings: CutSettings): CutPlan | null {
  const words = flattenWords(segments).filter(w => w.text)
  if (!words.length) return null

  const head = settings.headSec ?? 0.15
  const tailMax = settings.tailSec ?? 1.2
  // Marge apres un mot : la pause jusqu'au mot suivant moins 0,1 s, entre 0,15 s et tailMax.
  const tailAfter = (word: TranscriptWord): number => {
    const next = words[words.indexOf(word) + 1]
    const gap = next ? next.start - word.end : Infinity
    return Math.min(tailMax, Math.max(0.15, gap - 0.1))
  }
  const starts = sentenceStarts(segments)

  // Fin : le chat reagit APRES la chute, donc on cherche la derniere phrase terminee juste avant (ou peu apres) le pic.
  const grace = settings.graceSec ?? 2
  const spoken = words.filter(w => w.end <= peakSec + grace)
  const pool = spoken.length ? spoken : [words[0]]
  const lastWord = pool[pool.length - 1]
  const ends = phraseEnds(words)
  const closing = [...pool].reverse().find(w => ends.has(w) && w.end >= lastWord.end - 6) ?? lastWord
  const endSec = closing.end + tailAfter(closing)

  // Debut : on recule de phrase en phrase jusqu'a ce que la duree MONTEE (silences retires) atteigne minSec,
  // sans jamais depasser maxSec de duree brute.
  const candidates = starts.filter(s => s < closing.start)
  let startSec = candidates.length ? Math.max(0, candidates[candidates.length - 1] - head) : Math.max(0, words[0].start - head)
  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = Math.max(0, candidates[i] - head)
    if (endSec - candidate > settings.maxSec) break
    startSec = candidate
    const trimmed = trimSilences(words, startSec, endSec, settings).reduce((sum, r) => sum + (r.end - r.start), 0)
    if (trimmed >= settings.minSec) break
  }
  // Duree montee encore sous le minimum (peu de phrases avant le pic) : on prolonge sur les phrases suivantes,
  // chacune terminee, sans depasser maxSec de duree brute.
  let finalEnd = endSec
  let keepRanges = trimSilences(words, startSec, finalEnd, settings)
  let durationSec = keepRanges.reduce((sum, r) => sum + (r.end - r.start), 0)
  if (durationSec < settings.minSec) {
    const later = words.filter(w => w.end > closing.end && ends.has(w))
    for (const word of later) {
      const candidateEnd = word.end + tailAfter(word)
      if (candidateEnd - startSec > settings.maxSec) break
      finalEnd = candidateEnd
      keepRanges = trimSilences(words, startSec, finalEnd, settings)
      durationSec = keepRanges.reduce((sum, r) => sum + (r.end - r.start), 0)
      if (durationSec >= settings.minSec) break
    }
  }
  // Fin qui respire : on garde jusqu'a afterPhrases phrases de plus apres la chute (la suite de l'histoire, la reaction du streamer),
  // seulement si elles s'enchainent sans coupure (pause <= 1,5 s), dans la limite de afterMaxSec de parole et de maxSec au total.
  let lastIdx = -1
  words.forEach((w, i) => { if (w.end <= finalEnd - 0.1) lastIdx = i })
  const anchorEnd = lastIdx >= 0 ? words[lastIdx].end : finalEnd
  let phrases = 0
  for (let i = lastIdx + 1; i < words.length && phrases < (settings.afterPhrases ?? 2); i++) {
    const previous = words[i - 1]
    if (!previous || words[i].start - previous.end > 1.5) break
    if (!ends.has(words[i]) || i === words.length - 1) continue
    const candidateEnd = words[i].end + tailAfter(words[i])
    if (words[i].end - anchorEnd > (settings.afterMaxSec ?? 10) || candidateEnd - startSec > settings.maxSec) break
    finalEnd = candidateEnd
    phrases++
  }
  if (phrases) {
    keepRanges = trimSilences(words, startSec, finalEnd, settings)
    durationSec = keepRanges.reduce((sum, r) => sum + (r.end - r.start), 0)
  }
  const hookWords = words.filter(w => w.start >= startSec).slice(0, 12).map(w => w.text)
  const lastWords = words.filter(w => w.end <= finalEnd).slice(-8).map(w => w.text)

  return {
    startSec,
    endSec: finalEnd,
    keepRanges,
    durationSec,
    meetsMin: durationSec >= settings.minSec,
    hook: hookWords.join(' '),
    lastWords: lastWords.join(' ')
  }
}
