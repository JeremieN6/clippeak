// Demarrage rapide d'un nouveau streamer : a l'inscription, ses derniers lives passes sont enregistres tout de suite pour etre analyses, sans
// attendre son prochain direct (le rattrapage periodique ignore volontairement tout ce qui date d'avant l'inscription : voir vodCatchup.ts).
// Regles pures et testables : l'acces a Twitch et a la base est injecte.

import type { TwitchLiveStream, TwitchVideo } from './twitchApi.ts'
import type { VodRecord } from './vodSync.ts'

// Nombre de lives repris, duree minimale d'un live qui vaut la peine d'etre analyse, anciennete maximale (Twitch garde les VODs 7 a 60 jours).
export const WELCOME_MAX_VODS = 2
export const WELCOME_MIN_SEC = 10 * 60
export const WELCOME_MAX_AGE_DAYS = 14
// Audio total lu pour la reprise : le plafond mensuel gratuit de la detection par le contenu (10 h, voir contentDetection.ts). Le 2e live n'est repris
// que s'il tient dans ce plafond avec le premier, sinon il consommerait le mois du streamer avant son premier clip.
export const WELCOME_AUDIO_BUDGET_SEC = 10 * 3600

export interface WelcomeDeps {
  api: {
    listArchives: (userId: string, first?: number) => Promise<TwitchVideo[]>
    getLiveStreams: (userIds: string[]) => Promise<Map<string, TwitchLiveStream>>
  }
  store: { upsertVod: (vod: VodRecord) => Promise<void>, countVods: (channelId: string) => Promise<number> }
  now?: () => Date
}

// Choisit les lives a reprendre parmi les archives (les plus recentes d'abord, comme Twitch les renvoie).
export function pickWelcomeVods(archives: TwitchVideo[], live: TwitchLiveStream | undefined, now: Date): TwitchVideo[] {
  const oldest = now.getTime() - WELCOME_MAX_AGE_DAYS * 24 * 3600 * 1000
  const picked: TwitchVideo[] = []
  let audioSec = 0
  for (const video of [...archives].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    if (picked.length >= WELCOME_MAX_VODS) break
    if (video.createdAt.getTime() < oldest) continue
    const recording = !!live && video.streamId === live.id
    // Le direct en cours n'a pas encore de duree : il compte comme un live, sans toucher au budget d'audio.
    if (!recording) {
      if (video.durationSec < WELCOME_MIN_SEC) continue
      if (picked.length > 0 && audioSec + video.durationSec > WELCOME_AUDIO_BUDGET_SEC) continue
      audioSec += video.durationSec
    }
    picked.push(video)
  }
  return picked
}

// Enregistre les derniers lives d'une chaine qui n'a encore aucune VOD. Renvoie le nombre de VODs enregistrees (0 si la chaine en avait deja).
export async function registerWelcomeVods(channel: { id: string, twitchId: string }, deps: WelcomeDeps): Promise<number> {
  if (await deps.store.countVods(channel.id) > 0) return 0
  const now = (deps.now ?? (() => new Date()))()
  const [archives, liveByUser] = await Promise.all([deps.api.listArchives(channel.twitchId, 10), deps.api.getLiveStreams([channel.twitchId])])
  const live = liveByUser.get(channel.twitchId)
  const picked = pickWelcomeVods(archives, live, now)
  for (const video of picked) {
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
  }
  return picked.length
}
