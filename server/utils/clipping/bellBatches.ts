// Lots prets pour la cloche : regle pure (testable), utilisee par server/worker/bell.ts.
export function batchNotes(rows: Array<{ channelId: string, batch: number, status: string }>): Array<{ channelId: string, batch: number, ready: number }> {
  const groups = new Map<string, { channelId: string, batch: number, busy: boolean, ready: number }>()
  for (const r of rows) {
    const key = `${r.channelId}:${r.batch}`
    const g = groups.get(key) ?? { channelId: r.channelId, batch: r.batch, busy: false, ready: 0 }
    if (r.status === 'queued' || r.status === 'rendering') g.busy = true
    if (r.status === 'review') g.ready++
    groups.set(key, g)
  }
  return [...groups.values()].filter(g => !g.busy && g.ready > 0).map(g => ({ channelId: g.channelId, batch: g.batch, ready: g.ready }))
}
