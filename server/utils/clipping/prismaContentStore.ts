import type { PrismaClient } from '@prisma/client'
import { channelClipRoom } from './prismaQuota'
import { monthStart, isQuotaExempt } from './quota'
import { isPayingStatus } from './billing'
import { detectionCapSec, detectionSecLeft, parseDetectionMode, usesContent } from './contentDetection'
import type { DetectionMode } from './contentDetection'
import type { TranscriptSegment } from './whisperTranscribe'
import type { TranscribeProvider } from './transcribeAuto'

type Db = Pick<PrismaClient, 'vod' | 'vodTranscript' | 'channel'>

export interface ContentTarget {
  vodId: string
  twitchVodId: string
  channelId: string
  channelName: string
  live: boolean
  startedAt: Date
  durationSec: number | null
  mode: DetectionMode
  keywords: string[]
  transcribedSec: number
  detectedSec: number
  // Secondes d'audio encore transcriptibles ce mois-ci (Infinity si illimite). A 0 : on ne transcrit plus, mais le deja transcrit est encore lu.
  secLeft: number
}

// Audio transcrit ce mois-ci par la chaine (plafond mensuel de la detection par le contenu).
export async function monthlyDetectionUsageSec(db: Pick<PrismaClient, 'vodTranscript'>, channelId: string, now: Date = new Date()): Promise<number> {
  const sum = await db.vodTranscript.aggregate({ _sum: { audioSec: true }, where: { channelId, createdAt: { gte: monthStart(now) } } })
  return sum._sum.audioSec ?? 0
}

// Acces base de la detection par le contenu : quels lives lire, la transcription partagee (une seule par live), l'avancement.
export function createContentStore(db: Db) {
  return {
    // Lives a lire : le direct en cours d'abord, puis les VODs terminees des 3 derniers jours dont la lecture n'est pas finie. Pas de VOD reservee
    // aux abonnes (sa video n'est plus lisible), pas de chaine en « chat seul », pas de chaine sans place de clips.
    async targets(): Promise<ContentTarget[]> {
      const rows = await db.vod.findMany({
        where: {
          OR: [{ status: 'live' }, { status: 'done', restrictedAt: null, createdAt: { gte: new Date(Date.now() - 3 * 24 * 3600 * 1000) } }],
          startedAt: { not: null },
          channel: { autoClip: true },
          transcript: { is: null }
        },
        orderBy: { createdAt: 'asc' },
        include: {
          channel: { select: { displayName: true, twitchId: true, settings: { select: { keywords: true, detectionMode: true, monthlyClipQuota: true } }, billing: { select: { status: true } } } }
        }
      })
      const inProgress = await db.vod.findMany({
        where: { transcript: { is: { doneAt: null } }, OR: [{ status: 'live' }, { status: 'done', restrictedAt: null }], startedAt: { not: null }, channel: { autoClip: true } },
        orderBy: { createdAt: 'asc' },
        include: {
          transcript: { select: { transcribedSec: true, detectedSec: true } },
          channel: { select: { displayName: true, twitchId: true, settings: { select: { keywords: true, detectionMode: true, monthlyClipQuota: true } }, billing: { select: { status: true } } } }
        }
      })
      const all = [
        ...inProgress.map(r => ({ row: r, transcribedSec: r.transcript?.transcribedSec ?? 0, detectedSec: r.transcript?.detectedSec ?? 0 })),
        ...rows.map(r => ({ row: r, transcribedSec: 0, detectedSec: 0 }))
      ].filter(t => usesContent(parseDetectionMode(t.row.channel.settings?.detectionMode)))

      const out: ContentTarget[] = []
      const secLeftByChannel = new Map<string, number>()
      for (const { row, transcribedSec, detectedSec } of all) {
        if (!secLeftByChannel.has(row.channelId)) {
          const c = row.channel
          const cap = detectionCapSec({ paying: isPayingStatus(c.billing?.status), unlimited: isQuotaExempt(c.twitchId) || c.settings?.monthlyClipQuota === null })
          secLeftByChannel.set(row.channelId, detectionSecLeft(cap, await monthlyDetectionUsageSec(db, row.channelId)))
        }
        // La place se decide VOD par VOD (gratuit en lives : un live deja admis continue, un nouveau n'est admis que s'il reste un live).
        if ((await channelClipRoom(db, row.channelId, undefined, row.id)) <= 0) continue
        const gate = { secLeft: secLeftByChannel.get(row.channelId)! }
        const startedAt = row.startedAt as Date
        out.push({
          vodId: row.id,
          twitchVodId: row.twitchVodId,
          channelId: row.channelId,
          channelName: row.channel.displayName,
          live: row.status === 'live',
          startedAt,
          durationSec: row.status === 'done' && row.endedAt ? Math.max(0, (row.endedAt.getTime() - startedAt.getTime()) / 1000) : null,
          mode: parseDetectionMode(row.channel.settings?.detectionMode),
          keywords: row.channel.settings?.keywords ?? [],
          transcribedSec,
          detectedSec,
          secLeft: gate.secLeft
        })
      }
      // Le direct d'abord, puis le plus avance (finir ce qui est commence).
      return out.sort((a, b) => Number(b.live) - Number(a.live))
    },

    async segments(vodId: string): Promise<TranscriptSegment[]> {
      const row = await db.vodTranscript.findUnique({ where: { vodId }, select: { segments: true } })
      return Array.isArray(row?.segments) ? row.segments as unknown as TranscriptSegment[] : []
    },

    // Ajoute une tranche : les phrases deja gardees qui commencent apres le debut de la tranche sont remplacees (la tranche recule de 30 s pour ne
    // pas couper une phrase a la jonction, la nouvelle version est la bonne).
    async appendSlice(target: Pick<ContentTarget, 'vodId' | 'channelId'>, slice: { startSec: number, endSec: number, audioSec: number, workSec: number, provider: TranscribeProvider }, segments: TranscriptSegment[]) {
      const previous = await db.vodTranscript.findUnique({ where: { vodId: target.vodId }, select: { segments: true, audioSec: true, workSec: true } })
      const kept = (Array.isArray(previous?.segments) ? previous.segments as unknown as TranscriptSegment[] : []).filter(s => s.start < slice.startSec)
      const data = {
        segments: [...kept, ...segments] as any,
        transcribedSec: slice.endSec,
        audioSec: (previous?.audioSec ?? 0) + slice.audioSec,
        workSec: (previous?.workSec ?? 0) + slice.workSec,
        provider: slice.provider,
        error: null
      }
      await db.vodTranscript.upsert({ where: { vodId: target.vodId }, update: data, create: { vodId: target.vodId, channelId: target.channelId, ...data } })
    },

    async markDetected(vodId: string, detectedSec: number) {
      await db.vodTranscript.update({ where: { vodId }, data: { detectedSec, error: null } })
    },

    async markDone(vodId: string) {
      await db.vodTranscript.update({ where: { vodId }, data: { doneAt: new Date(), error: null } })
    },

    // Garde le message d'erreur pour le live. Avec channelId, la ligne est creee si la premiere tranche n'a pas encore pu etre ecrite (sinon le
    // message serait perdu).
    async fail(vodId: string, error: string, channelId?: string) {
      const message = error.slice(0, 500)
      if (channelId) await db.vodTranscript.upsert({ where: { vodId }, update: { error: message }, create: { vodId, channelId, error: message } })
      else await db.vodTranscript.updateMany({ where: { vodId }, data: { error: message } })
    }
  }
}

export type ContentStore = ReturnType<typeof createContentStore>
