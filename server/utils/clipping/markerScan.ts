import type { ChatMessage } from './chatPeaks.ts'
import { detectMarkers, markerWhy } from './longMarkers.ts'
import { defaultTitle } from './longProposalRules.ts'

// Lecture des commandes d'extrait long dans le chat d'un live (ou d'une VOD terminee) : les passages marques deviennent des propositions.
// Pendant le live, la lecture reprend toutes les quelques minutes avec un recouvrement (un debut tape avant la derniere lecture doit
// pouvoir trouver sa fin) ; les propositions deja creees ou ignorees ne sont jamais recreees (meme debut a quelques secondes pres).

export interface MarkerTarget {
  id: string
  channelId: string
  twitchVodId: string
  vodTitle: string | null
  channelLogin: string
  channelTwitchId: string
  live: boolean
  startedAt: Date | null
  endedAt: Date | null
  markerScanSec: number | null
  settings: { startCommand: string, endCommand: string, allowModerators: boolean, maxSec: number }
}

export interface NewProposal { title: string, why: string, startSec: number, endSec: number }

export interface MarkerStore {
  targets: () => Promise<MarkerTarget[]>
  // Debuts (en secondes) des propositions « repere du streamer » deja enregistrees pour ce live, ignorees comprises.
  existingStarts: (vodId: string) => Promise<number[]>
  createProposals: (target: MarkerTarget, items: NewProposal[]) => Promise<void>
  saveProgress: (vodId: string, scanSec: number, done: boolean) => Promise<void>
}

export interface ScanDeps {
  store: MarkerStore
  fetchChat: (twitchVodId: string, startOffsetSec: number) => Promise<ChatMessage[]>
}

const SAME_START_SEC = 5

export async function scanMarkers(target: MarkerTarget, deps: ScanDeps): Promise<{ created: number, messages: number }> {
  const { settings } = target
  const startOffset = Math.max(0, (target.markerScanSec ?? 0) - settings.maxSec - 60)
  const messages = await deps.fetchChat(target.twitchVodId, startOffset)
  const vodDurationSec = !target.live && target.startedAt && target.endedAt ? (target.endedAt.getTime() - target.startedAt.getTime()) / 1000 : null
  const passages = detectMarkers(messages, {
    startCommand: settings.startCommand, endCommand: settings.endCommand, channelLogin: target.channelLogin, channelTwitchId: target.channelTwitchId,
    allowModerators: settings.allowModerators, maxSec: settings.maxSec, final: !target.live, vodDurationSec
  })
  const existing = passages.length ? await deps.store.existingStarts(target.id) : []
  const fresh = passages.filter(p => !existing.some(s => Math.abs(s - p.startSec) < SAME_START_SEC))
  if (fresh.length) {
    await deps.store.createProposals(target, fresh.map(p => ({
      title: defaultTitle(target.vodTitle, p.startSec),
      why: markerWhy(p, settings),
      startSec: p.startSec,
      endSec: p.endSec
    })))
  }
  const lastChat = messages.length ? Math.max(...messages.map(m => m.t)) : startOffset
  await deps.store.saveProgress(target.id, Math.max(target.markerScanSec ?? 0, lastChat), !target.live)
  return { created: fresh.length, messages: messages.length }
}
