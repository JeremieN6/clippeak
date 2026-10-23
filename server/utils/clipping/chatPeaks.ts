export interface ChatMessage {
  t: number
  text: string
}

export interface PeakOptions {
  keywords?: string[]
  windowSec?: number
  stepSec?: number
  minMessages?: number
  minScore?: number
  minGapSec?: number
  preRollSec?: number
  maxPeaks?: number
}

export interface ChatPeak {
  startSec: number
  endSec: number
  peakSec: number
  score: number
  signals: {
    messages: number
    rateZ: number
    keywordShare: number
    capsShare: number
  }
}

export const DEFAULT_KEYWORDS = ['mdr', 'ptdr', 'lol', 'omg', 'xd', 'kekw']

const defaults = {
  windowSec: 10,
  stepSec: 5,
  minMessages: 5,
  minScore: 4,
  minGapSec: 45,
  preRollSec: 8,
  maxPeaks: 50
}

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildKeywordMatcher(keywords: string[]): (text: string) => boolean {
  const patterns = keywords
    .map(normalize)
    .map(k => k.trim())
    .filter(Boolean)
    .map(k => new RegExp(`^${escapeRegex(k)}${escapeRegex(k.slice(-1))}*$`))
  return (text: string) => {
    if (!patterns.length) return false
    const tokens = normalize(text).split(/[^a-z0-9]+/).filter(Boolean)
    return tokens.some(token => patterns.some(p => p.test(token)))
  }
}

export function isShouting(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, '')
  if (letters.length < 4) return false
  const upper = letters.replace(/[^\p{Lu}]/gu, '').length
  return upper / letters.length >= 0.7
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function detectChatPeaks(messages: ChatMessage[], options: PeakOptions = {}): ChatPeak[] {
  const opt = { ...defaults, ...options }
  if (!messages.length) return []

  const matchesKeyword = buildKeywordMatcher(options.keywords ?? DEFAULT_KEYWORDS)
  const binsPerWindow = Math.max(1, Math.round(opt.windowSec / opt.stepSec))
  const maxT = Math.max(...messages.map(m => m.t))
  const binCount = Math.floor(maxT / opt.stepSec) + 1

  const total = new Array<number>(binCount).fill(0)
  const keyword = new Array<number>(binCount).fill(0)
  const caps = new Array<number>(binCount).fill(0)

  for (const m of messages) {
    if (m.t < 0) continue
    const bin = Math.floor(m.t / opt.stepSec)
    total[bin]++
    if (matchesKeyword(m.text)) keyword[bin]++
    if (isShouting(m.text)) caps[bin]++
  }

  const windowCount = Math.max(1, binCount - binsPerWindow + 1)
  const sum = (arr: number[], start: number) => {
    let s = 0
    for (let i = start; i < start + binsPerWindow && i < binCount; i++) s += arr[i]
    return s
  }

  const rates = Array.from({ length: windowCount }, (_, w) => sum(total, w))
  const baseline = median(rates)
  const mad = median(rates.map(r => Math.abs(r - baseline)))
  const spread = Math.max(1.4826 * mad, 1)

  const candidates: ChatPeak[] = []
  for (let w = 0; w < windowCount; w++) {
    const msgs = rates[w]
    if (msgs < opt.minMessages) continue
    const rateZ = (msgs - baseline) / spread
    const keywordShare = sum(keyword, w) / msgs
    const capsShare = sum(caps, w) / msgs
    const raw = Math.max(0, rateZ) + 3 * keywordShare + 2 * capsShare
    const score = Math.round(10 * (1 - Math.exp(-raw / 4)) * 10) / 10
    if (score < opt.minScore) continue

    const windowStart = w * opt.stepSec
    candidates.push({
      startSec: Math.max(0, windowStart - opt.preRollSec),
      endSec: windowStart + opt.windowSec,
      peakSec: windowStart + opt.windowSec / 2,
      score,
      signals: {
        messages: msgs,
        rateZ: Math.round(rateZ * 10) / 10,
        keywordShare: Math.round(keywordShare * 100) / 100,
        capsShare: Math.round(capsShare * 100) / 100
      }
    })
  }

  candidates.sort((a, b) => b.score - a.score)
  const picked: ChatPeak[] = []
  for (const c of candidates) {
    if (picked.length >= opt.maxPeaks) break
    if (picked.every(p => Math.abs(p.peakSec - c.peakSec) >= opt.minGapSec)) picked.push(c)
  }
  return picked.sort((a, b) => a.peakSec - b.peakSec)
}
