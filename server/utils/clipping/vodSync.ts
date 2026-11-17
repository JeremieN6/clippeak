import type { TwitchApi, TwitchLiveStream, TwitchVideo } from './twitchApi.ts'

export interface KnownChannel {
  id: string
  twitchId: string
  autoClip: boolean
}

export interface VodRecord {
  channelId: string
  twitchVodId: string
  url: string
  title: string | null
  startedAt: Date | null
  status: 'live' | 'ended'
  source: 'auto' | 'manual'
  endedAt?: Date | null
}

// Enregistrement d'une archive Twitch decouverte hors evenement (reprise de l'inscription, rattrapage periodique) : « live » si c'est le
// direct en cours (debut = celui du direct, pas de fin), sinon « termine » avec sa date de fin deduite de sa duree. Une seule version.
export function vodRecordFromArchive(channelId: string, video: TwitchVideo, live: TwitchLiveStream | undefined): VodRecord {
  const current = live && video.streamId === live.id ? live : null
  return {
    channelId,
    twitchVodId: video.id,
    url: video.url,
    title: video.title || null,
    startedAt: current ? current.startedAt : video.createdAt,
    endedAt: current ? null : new Date(video.createdAt.getTime() + video.durationSec * 1000),
    status: current ? 'live' : 'ended',
    source: 'auto'
  }
}

export interface VodStore {
  findChannelByTwitchId(twitchId: string): Promise<KnownChannel | null>
  upsertVod(vod: VodRecord): Promise<void>
  markLiveVodsEnded(channelId: string, endedAt: Date): Promise<number>
}

export interface SyncDeps {
  api: Pick<TwitchApi, 'listArchives'>
  store: VodStore
  sleep?: (ms: number) => Promise<void>
  now?: () => Date
  retries?: number
  retryDelayMs?: number
}

export type SyncOutcome = 'ignored' | 'vod_registered' | 'vod_pending' | 'ended'

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export async function handleStreamOnline(
  event: { id: string, broadcaster_user_id: string, started_at?: string },
  deps: SyncDeps
): Promise<SyncOutcome> {
  const channel = await deps.store.findChannelByTwitchId(event.broadcaster_user_id)
  if (!channel || !channel.autoClip) return 'ignored'

  const attempts = deps.retries ?? 6
  const delay = deps.retryDelayMs ?? 20_000
  const sleep = deps.sleep ?? wait

  // La VOD n'apparait parfois que quelques dizaines de secondes apres le debut du live.
  for (let attempt = 0; attempt < attempts; attempt++) {
    const archives = await deps.api.listArchives(event.broadcaster_user_id)
    const video = archives.find(v => v.streamId === event.id)
    if (video) {
      await deps.store.upsertVod({
        channelId: channel.id,
        twitchVodId: video.id,
        url: video.url,
        title: video.title || null,
        startedAt: event.started_at ? new Date(event.started_at) : video.createdAt,
        status: 'live',
        source: 'auto'
      })
      return 'vod_registered'
    }
    if (attempt < attempts - 1) await sleep(delay)
  }
  return 'vod_pending'
}

// Filet de securite : enregistre les VODs recentes pas encore connues (appelee a la fin du live).
export async function syncRecentVods(channel: KnownChannel, deps: SyncDeps, limit = 5): Promise<number> {
  const archives = (await deps.api.listArchives(channel.twitchId)).slice(0, limit)
  for (const video of archives) {
    await deps.store.upsertVod({
      channelId: channel.id,
      twitchVodId: video.id,
      url: video.url,
      title: video.title || null,
      startedAt: video.createdAt,
      status: 'live',
      source: 'auto'
    })
  }
  return archives.length
}

export async function handleStreamOffline(
  event: { broadcaster_user_id: string },
  deps: SyncDeps
): Promise<SyncOutcome> {
  const channel = await deps.store.findChannelByTwitchId(event.broadcaster_user_id)
  if (!channel || !channel.autoClip) return 'ignored'

  await syncRecentVods(channel, deps, 1)
  await deps.store.markLiveVodsEnded(channel.id, (deps.now ?? (() => new Date()))())
  return 'ended'
}
