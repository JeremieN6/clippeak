import type { PrismaClient } from '@prisma/client'
import { dataDir, safeResolve } from './dataDir'
import type { DuePublication, PublishStore } from './publishQueue'

export interface TokenVault {
  decrypt: (stored: string) => string
}

// `db` peut etre le client ou un client de transaction (tests sans ecriture durable).
export function createPrismaPublishStore(db: PrismaClient, vault: TokenVault): PublishStore {
  const safeDecrypt = (stored: string | null): string | null => {
    if (!stored) return null
    try { return vault.decrypt(stored) } catch { return null }
  }

  return {
    // Une publication « en cours » interrompue (arret du worker) a peut-etre deja ete envoyee : on ne la rejoue pas, de peur d'un
    // doublon sur la chaine du streamer. Elle passe en echec avec un message qui lui dit de verifier.
    async requeueInterrupted() {
      const r = await db.publication.updateMany({
        where: { status: 'publishing' },
        data: { status: 'failed', error: 'Publication interrompue : vérifie sur la plateforme si le clip est déjà en ligne avant de la reprogrammer.' }
      })
      return r.count
    },

    async claimDue() {
      // Heure de la base (UTC, comme les colonnes de Prisma) : un Date passe en parametre brut peut etre decale par le fuseau. SKIP LOCKED : jamais prise deux fois.
      const rows = await db.$queryRaw<Array<{ id: string, platform: string, attempts: number, clip_job_id: string }>>`
        UPDATE "public"."publications" SET "status" = 'publishing', "attempts" = "attempts" + 1, "updated_at" = now()
        WHERE "id" = (
          SELECT "id" FROM "public"."publications"
          WHERE "status" = 'scheduled' AND "scheduled_at" <= timezone('utc', now())
          ORDER BY "scheduled_at" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING "id", "platform", "attempts" - 1 AS "attempts", "clip_job_id"`
      const row = rows[0]
      if (!row) return null

      const job = await db.clipJob.findUnique({
        where: { id: row.clip_job_id },
        select: { id: true, status: true, title: true, caption: true, hashtags: true, outputPath: true, moment: { select: { vod: { select: { channelId: true } } } } }
      })
      const connection = job
        ? await db.platformConnection.findUnique({ where: { channelId_platform: { channelId: job.moment.vod.channelId, platform: row.platform } } })
        : null
      const due: DuePublication = {
        id: row.id,
        platform: row.platform,
        attempts: Number(row.attempts),
        clip: {
          id: row.clip_job_id,
          title: job?.title ?? '',
          caption: job?.caption ?? '',
          hashtags: job?.hashtags ?? '',
          videoPath: job?.outputPath ? safeResolve(dataDir(), job.outputPath) : null,
          status: job?.status ?? 'missing'
        },
        connection: connection
          ? { id: connection.id, refreshToken: safeDecrypt(connection.refreshTokenEnc), accessToken: safeDecrypt(connection.accessTokenEnc), expiresAt: connection.expiresAt }
          : null
      }
      return due
    },

    async saveAccessToken(connectionId, token) {
      // Le jeton arrive deja chiffre (voir server/worker/publish.ts).
      await db.platformConnection.update({ where: { id: connectionId }, data: { accessTokenEnc: token.value, expiresAt: token.expiresAt } })
    },

    async markPublished(id, result, at) {
      await db.publication.update({ where: { id }, data: { status: 'published', publishedAt: at, externalId: result.externalId, externalUrl: result.url, error: null } })
    },

    async markFailed(id, error, retryAt) {
      await db.publication.update({ where: { id }, data: retryAt ? { status: 'scheduled', scheduledAt: retryAt, error } : { status: 'failed', error } })
    }
  }
}
