import type { TranscriptSegment, TranscriptWord } from './whisperTranscribe.ts'

export interface CutSettings {
  minSec: number
  maxSec: number
  // Pause entre deux mots au-dela de laquelle on coupe ; la pause conservee est ramenee a keepPauseSec.
  maxPauseSec?: number
  keepPauseSec?: number
  // Marge gardee apres le dernier mot : la chute est passee, on ne finit pas sur un mot coupe.
  tailSec?: number
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

function flattenWords(segments: TranscriptSegment[]): TranscriptWord[] {
  return segments.flatMap(s => s.words?.length ? s.words : [{ start: s.start, end: s.end, text: s.text }])
}

// Debuts de phrases (temps de VOD) : debut de segment Whisper, ou mot suivant une ponctuation finale.
function sentenceStarts(segments: TranscriptSegment[]): number[] {
  const starts = new Set<number>()
  for (const segment of segments) {
    const words = segment.words?.length ? segment.words : [{ start: segment.start, end: segment.end, text: segment.text }]
    starts.add(words[0].start)
    words.forEach((w, i) => {
      if (i > 0 && SENTENCE_END.test(words[i - 1].text)) starts.add(w.start)
    })
  }
  return [...starts].sort((a, b) => a - b)
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
  const tail = settings.tailSec ?? 0.5
  const starts = sentenceStarts(segments)

  // Fin : le chat reagit APRES la chute, donc on cherche la derniere phrase terminee juste avant (ou peu apres) le pic.
  const grace = settings.graceSec ?? 2
  const spoken = words.filter(w => w.end <= peakSec + grace)
  const pool = spoken.length ? spoken : [words[0]]
  const lastWord = pool[pool.length - 1]
  const closing = [...pool].reverse().find(w => SENTENCE_END.test(w.text) && w.end >= lastWord.end - 6) ?? lastWord
  const endSec = closing.end + tail

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
  const keepRanges = trimSilences(words, startSec, endSec, settings)
  const durationSec = keepRanges.reduce((sum, r) => sum + (r.end - r.start), 0)
  const hookWords = words.filter(w => w.start >= startSec).slice(0, 12).map(w => w.text)
  const lastWords = words.filter(w => w.end <= endSec).slice(-8).map(w => w.text)

  return {
    startSec,
    endSec,
    keepRanges,
    durationSec,
    meetsMin: durationSec >= settings.minSec,
    hook: hookWords.join(' '),
    lastWords: lastWords.join(' ')
  }
}
