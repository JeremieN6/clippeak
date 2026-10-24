import { prisma } from '../prisma'
import { prismaVodStore } from './prismaVodStore'
import type { CatchupStore } from './vodCatchup'

export const prismaCatchupStore: CatchupStore = {
  async listAutoClipChannels() {
    const channels = await prisma.channel.findMany({ where: { autoClip: true } })
    return channels.map(c => ({ id: c.id, twitchId: c.twitchId, createdAt: c.createdAt }))
  },

  async findKnownVodIds(twitchVodIds) {
    if (!twitchVodIds.length) return new Set()
    const rows = await prisma.vod.findMany({
      where: { twitchVodId: { in: twitchVodIds } },
      select: { twitchVodId: true }
    })
    return new Set(rows.map(r => r.twitchVodId))
  },

  async listLiveVodIds(channelId) {
    const rows = await prisma.vod.findMany({
      where: { channelId, status: 'live' },
      select: { twitchVodId: true }
    })
    return rows.map(r => r.twitchVodId)
  },

  upsertVod: prismaVodStore.upsertVod,

  async markVodEnded(twitchVodId, endedAt) {
    // Ne touche qu'aux VODs encore "live" : une VOD deja en analyse ne doit pas etre ecrasee.
    await prisma.vod.updateMany({
      where: { twitchVodId, status: 'live' },
      data: { status: 'ended', endedAt }
    })
  }
}
