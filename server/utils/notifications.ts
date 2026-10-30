import { prisma } from './prisma'
import type { Note } from './clipping/roadmap'

// Cloche du studio : une notification = une ligne par chaine. Les evenements de « Prochainement » (vote lance, resultat, statut)
// sont envoyes a toutes les chaines, avec un texte propre a chacune quand c'est utile (resultat selon son vote).
export async function notifyAll(note: Note | null): Promise<void> {
  if (!note) return
  const channels = await prisma.channel.findMany({ select: { id: true } })
  if (!channels.length) return
  await prisma.notification.createMany({ data: channels.map(c => ({ channelId: c.id, kind: note.kind, title: note.title, body: note.body })) })
}

export async function notifyEach(notes: Array<{ channelId: string, note: Note }>): Promise<void> {
  if (!notes.length) return
  await prisma.notification.createMany({ data: notes.map(n => ({ channelId: n.channelId, kind: n.note.kind, title: n.note.title, body: n.note.body })) })
}
