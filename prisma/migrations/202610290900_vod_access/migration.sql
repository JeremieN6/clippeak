-- AlterEnum : une VOD reservee aux abonnes attend qu'elle devienne lisible (statut "blocked")
ALTER TYPE "public"."VodStatus" ADD VALUE IF NOT EXISTS 'blocked';

-- AlterTable : suivi de l'acces a la VOD et des extraits sources
ALTER TABLE "public"."vods" ADD COLUMN "restricted_at" TIMESTAMP(3);
ALTER TABLE "public"."vods" ADD COLUMN "sources_saved_at" TIMESTAMP(3);
ALTER TABLE "public"."vods" ADD COLUMN "restore_ack_at" TIMESTAMP(3);
ALTER TABLE "public"."vods" ADD COLUMN "error" TEXT;
