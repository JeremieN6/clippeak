import type { KeepRange } from './cutPlanner.ts'

export interface Timeline {
  totalSec: number
  // Temps de VOD -> temps du clip monte (silences retires). Un instant coupe est ramene au debut de la plage suivante.
  toClipTime: (vodSec: number) => number
}

export function buildTimeline(keepRanges: KeepRange[]): Timeline {
  const offsets: number[] = []
  let total = 0
  for (const range of keepRanges) {
    offsets.push(total)
    total += range.end - range.start
  }

  return {
    totalSec: total,
    toClipTime(vodSec) {
      for (let i = 0; i < keepRanges.length; i++) {
        const range = keepRanges[i]
        if (vodSec <= range.end) return offsets[i] + Math.max(0, vodSec - range.start)
      }
      return total
    }
  }
}
