// Avancement d'un rendu ecrit en base : au plus une ecriture toutes les `minGapMs`, seulement quand le pourcentage monte, jamais 100 avant la
// fin (100 est ecrit par done()). Une ecriture qui echoue ne doit jamais faire echouer le rendu.
export interface ProgressWriter {
  report: (fraction: number) => void
  done: () => Promise<void>
}

export function createProgressWriter(write: (percent: number) => Promise<void>, options: { minGapMs?: number, now?: () => number } = {}): ProgressWriter {
  const minGap = options.minGapMs ?? 2000
  const now = options.now ?? (() => Date.now())
  let last = -1
  let lastAt = 0
  let pending: Promise<void> = Promise.resolve()

  const send = (percent: number) => {
    last = percent
    lastAt = now()
    pending = pending.then(() => write(percent)).catch(() => {})
  }

  return {
    report(fraction) {
      if (!Number.isFinite(fraction)) return
      const percent = Math.min(99, Math.max(0, Math.floor(fraction * 100)))
      if (percent <= last) return
      if (last >= 0 && now() - lastAt < minGap) return
      send(percent)
    },
    async done() {
      send(100)
      await pending
    }
  }
}
