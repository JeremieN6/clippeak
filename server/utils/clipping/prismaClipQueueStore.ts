import type { PrismaClient } from '@prisma/client'
import type { ClipQueueStore } from './clipQueue'

// `db` peut etre le client ou un client de transaction (utile pour tester sans rien ecrire durablement).
export function createPrismaClipQueueStore(db: Pick<PrismaClient, '$queryRaw' | '$executeRaw'>): ClipQueueStore {
  return {
    async requeueInterrupted() {
      return db.$executeRaw`UPDATE "public"."clip_jobs" SET "status" = 'queued', "updated_at" = now() WHERE "status" = 'rendering'`
    },

    async claimNext() {
      // SKIP LOCKED : meme avec deux workers par erreur, un job n'est jamais pris deux fois.
      // Les lots les plus anciens d'abord (batch NULL en dernier), puis par date de creation.
      const rows = await db.$queryRaw<Array<{ id: string, moment_id: string, title: string | null }>>`
        UPDATE "public"."clip_jobs" SET "status" = 'rendering', "updated_at" = now()
        WHERE "id" = (
          SELECT "id" FROM "public"."clip_jobs"
          WHERE "status" = 'queued'
          ORDER BY "batch" ASC NULLS LAST, "created_at" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING "id", "moment_id", "title"`
      const row = rows[0]
      return row ? { id: row.id, momentId: row.moment_id, title: row.title } : null
    },

    async markReview(id, outputPath) {
      await db.$executeRaw`UPDATE "public"."clip_jobs" SET "status" = 'review', "output_path" = ${outputPath}, "error" = NULL, "updated_at" = now() WHERE "id" = ${id}::uuid`
    },

    async markFailed(id, error) {
      await db.$executeRaw`UPDATE "public"."clip_jobs" SET "status" = 'failed', "error" = ${error}, "updated_at" = now() WHERE "id" = ${id}::uuid`
    }
  }
}
