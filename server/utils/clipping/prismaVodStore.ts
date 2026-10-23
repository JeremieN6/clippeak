import { prisma } from '../prisma'
import type { VodStore } from './vodSync'

export const prismaVodStore: VodStore = {
  async findChannelByTwitchId(twitchId) {
    const channel = await prisma.channel.findUnique({ where: { twitchId } })
    return channel ? { id: channel.id, twitchId: channel.twitchId, autoClip: channel.autoClip } : null
  },

  async upsertVod(vod) {
    await prisma.vod.upsert({
      where: { twitchVodId: vod.twitchVodId },
      // Ne jamais repasser une VOD terminee ou en analyse a "live".
      update: { title: vod.title },
      create: {
        channelId: vod.channelId,
        twitchVodId: vod.twitchVodId,
        url: vod.url,
        title: vod.title,
        startedAt: vod.startedAt,
        status: vod.status,
        source: vod.source
      }
    })
  },

  async markLiveVodsEnded(channelId, endedAt) {
    const result = await prisma.vod.updateMany({
      where: { channelId, status: 'live' },
      data: { status: 'ended', endedAt }
    })
    return result.count
  }
}
