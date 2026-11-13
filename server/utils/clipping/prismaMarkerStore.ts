import type { PrismaClient } from '@prisma/client'
import { clampLongMax } from './longExtract.ts'
import type { MarkerStore, MarkerTarget } from './markerScan.ts'

type Db = Pick<PrismaClient, 'vod' | 'longProposal'>

const RECENT_DAYS = 7

// Lives a lire : en direct, ou termines depuis moins de 7 jours et pas encore lus jusqu'au bout, pour les chaines qui ont active les
// extraits longs.
export function createPrismaMarkerStore(db: Db): MarkerStore {
  return {
    async targets() {
      const since = new Date(Date.now() - RECENT_DAYS * 24 * 3600 * 1000)
      const rows = await db.vod.findMany({
        where: {
          channel: { settings: { is: { longExtracts: true } } },
          OR: [{ status: 'live' }, { status: { in: ['ended', 'done'] }, markersDoneAt: null, createdAt: { gte: since } }]
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { channel: { select: { login: true, twitchId: true, settings: true } } }
      })
      return rows.flatMap((v): MarkerTarget[] => {
        const s = v.channel.settings
        if (!s) return []
        return [{
          id: v.id, channelId: v.channelId, twitchVodId: v.twitchVodId, vodTitle: v.title, channelLogin: v.channel.login, channelTwitchId: v.channel.twitchId,
          live: v.status === 'live', startedAt: v.startedAt, endedAt: v.endedAt, markerScanSec: v.markerScanSec,
          settings: { startCommand: s.longStartCommand, endCommand: s.longEndCommand, allowModerators: s.longModsAllowed, maxSec: clampLongMax(s.longExtractMaxSec, s.longExtractVerified) }
        }]
      })
    },

    async existingStarts(vodId) {
      const rows = await db.longProposal.findMany({ where: { vodId, origin: 'streamer' }, select: { startSec: true } })
      return rows.map(r => r.startSec)
    },

    async createProposals(target, items) {
      await db.longProposal.createMany({
        data: items.map(i => ({ channelId: target.channelId, vodId: target.id, origin: 'streamer', title: i.title, why: i.why, startSec: i.startSec, endSec: i.endSec }))
      })
    },

    async saveProgress(vodId, scanSec, done) {
      await db.vod.update({ where: { id: vodId }, data: { markerScanSec: scanSec, ...(done ? { markersDoneAt: new Date() } : {}) } })
    }
  }
}
