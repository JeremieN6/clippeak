import type { PrismaClient } from '@prisma/client'
import type { ReferenceJob, ReferenceStore } from './referencePipeline.ts'
import type { ProfileItem } from './referenceProfile.ts'
import type { ReferenceAnalysis } from './referenceAnalysis.ts'

type QueueDb = Pick<PrismaClient, '$queryRaw' | '$executeRaw' | 'referenceItem'>

// `db` peut etre le client ou un client de transaction (tests sur base jetable).
export function createPrismaReferenceStore(db: QueueDb): ReferenceStore {
  return {
    async requeueInterrupted() {
      return db.$executeRaw`UPDATE "public"."reference_items" SET "status" = 'pending' WHERE "status" = 'processing'`
    },

    async claimNext() {
      // SKIP LOCKED : un element n'est jamais pris deux fois. Les comptes d'abord (ils creent les clips), puis les plus anciens.
      const rows = await db.$queryRaw<Array<{ id: string, channel_id: string, kind: string, source: string, url: string | null, file_path: string | null, title: string | null }>>`
        UPDATE "public"."reference_items" SET "status" = 'processing', "error" = NULL
        WHERE "id" = (
          SELECT "id" FROM "public"."reference_items"
          WHERE "status" = 'pending'
          ORDER BY ("kind" = 'account') DESC, "created_at" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING "id", "channel_id", "kind", "source", "url", "file_path", "title"`
      const row = rows[0]
      return row ? { id: row.id, channelId: row.channel_id, kind: row.kind, source: row.source, url: row.url, filePath: row.file_path, title: row.title } : null
    },

    async saveDone(id, result) {
      await db.referenceItem.update({
        where: { id },
        data: {
          status: 'done',
          error: null,
          title: result.title?.slice(0, 255) ?? null,
          durationSec: result.durationSec,
          // Les statistiques saisies a la main ne sont jamais ecrasees par du vide.
          ...(result.viewCount !== null ? { viewCount: result.viewCount } : {}),
          ...(result.likeCount !== null ? { likeCount: result.likeCount } : {}),
          ...(result.commentCount !== null ? { commentCount: result.commentCount } : {}),
          ...(result.shareCount !== null ? { shareCount: result.shareCount } : {}),
          transcript: { text: result.transcript },
          analysis: result.analysis as unknown as object,
          analyzedAt: new Date()
        }
      })
    },

    async saveFailed(id, error) {
      await db.referenceItem.update({ where: { id }, data: { status: 'failed', error: error.slice(0, 500) } })
    },

    async finishAccount(job: ReferenceJob, urls: string[]) {
      const created = await db.referenceItem.createMany({
        data: urls.map(url => ({ channelId: job.channelId, parentId: job.id, kind: 'clip', source: job.source, url })),
        skipDuplicates: true
      })
      await db.referenceItem.update({
        where: { id: job.id },
        data: { status: 'done', error: null, note: `${created.count} clip(s) ajoute(s) sur ${urls.length} trouve(s)`, analyzedAt: new Date() }
      })
      return created.count
    }
  }
}

export interface ReferenceRow {
  id: string
  title: string | null
  transcript: unknown
  analysis: unknown
  viewCount: number | null
  likeCount: number | null
  commentCount: number | null
  shareCount: number | null
}

export const transcriptText = (value: unknown): string => {
  const text = (value as { text?: unknown } | null)?.text
  return typeof text === 'string' ? text : ''
}

export function toProfileItem(row: ReferenceRow): ProfileItem {
  const analysis = row.analysis && typeof row.analysis === 'object' ? row.analysis as ReferenceAnalysis : null
  return {
    id: row.id,
    title: row.title,
    viewCount: row.viewCount,
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    shareCount: row.shareCount,
    analysis,
    transcript: transcriptText(row.transcript)
  }
}

// Clips analyses d'un streamer (le profil et la ressemblance n'utilisent que ceux-la).
export async function loadAnalyzedReferences(db: Pick<PrismaClient, 'referenceItem'>, channelId: string): Promise<ProfileItem[]> {
  const rows = await db.referenceItem.findMany({ where: { channelId, kind: 'clip', status: 'done' }, orderBy: { createdAt: 'asc' } })
  return rows.map(toProfileItem)
}
