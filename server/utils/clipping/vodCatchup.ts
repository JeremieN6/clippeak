import type { TwitchApi } from './twitchApi.ts'
import type { VodRecord } from './vodSync.ts'

export interface CatchupChannel {
  id: string
  twitchId: string
  createdAt: Date
}

export interface CatchupStore {
  listAutoClipChannels(): Promise<CatchupChannel[]>
  findKnownVodIds(twitchVodIds: string[]): Promise<Set<string>>
  listLiveVodIds(channelId: string): Promise<string[]>
  upsertVod(vod: VodRecord): Promise<void>
  markVodEnded(twitchVodId: string, endedAt: Date): Promise<void>
}

export interface CatchupDeps {
  api: Pick<TwitchApi, 'listArchives' | 'getLiveStreams'>
  store: CatchupStore
  now?: () => Date
  archivesPerChannel?: number
}

export interface CatchupSummary {
  channels: number
  registered: number
  closed: number
  errors: number
}

// Rattrapage des notifications EventSub perdues (redemarrage du serveur, panne reseau, abonnement revoque).
// Compare l'etat reel de Twitch (directs en cours + VODs recentes) a la base et corrige l'ecart :
// - VOD d'un stream apparu depuis la creation de la chaine mais absente de la base -> enregistree ;
// - VOD marquee "live" alors que le direct est termine -> passee a "ended".
// On ne reprend jamais l'historique anterieur a l'enregistrement de la chaine : analyser d'anciennes
// VODs est une decision produit, pas un effet de bord du rattrapage.
export async function runVodCatchup(deps: CatchupDeps): Promise<CatchupSummary> {
  const now = deps.now ?? (() => new Date())
  const summary: CatchupSummary = { channels: 0, registered: 0, closed: 0, errors: 0 }

  const channels = await deps.store.listAutoClipChannels()
  summary.channels = channels.length
  if (!channels.length) return summary

  const liveByUser = await deps.api.getLiveStreams(channels.map(c => c.twitchId))

  for (const channel of channels) {
    try {
      const live = liveByUser.get(channel.twitchId)
      const archives = await deps.api.listArchives(channel.twitchId, deps.archivesPerChannel ?? 20)
      const recent = archives.filter(v => v.createdAt >= channel.createdAt)
      const known = await deps.store.findKnownVodIds(recent.map(v => v.id))

      for (const video of recent) {
        if (known.has(video.id)) continue
        const recording = !!live && video.streamId === live.id
        await deps.store.upsertVod({
          channelId: channel.id,
          twitchVodId: video.id,
          url: video.url,
          title: video.title || null,
          startedAt: recording ? live.startedAt : video.createdAt,
          endedAt: recording ? null : new Date(video.createdAt.getTime() + video.durationSec * 1000),
          status: recording ? 'live' : 'ended',
          source: 'auto'
        })
        summary.registered++
      }

      for (const vodId of await deps.store.listLiveVodIds(channel.id)) {
        const archive = archives.find(v => v.id === vodId)
        if (live && archive && archive.streamId === live.id) continue
        const endedAt = archive ? new Date(archive.createdAt.getTime() + archive.durationSec * 1000) : now()
        await deps.store.markVodEnded(vodId, endedAt)
        summary.closed++
      }
    } catch (error) {
      summary.errors++
      console.error('[twitch] rattrapage en echec pour', channel.twitchId, error)
    }
  }
  return summary
}
