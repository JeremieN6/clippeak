-- Propositions d'extraits longs YouTube (additive).
CREATE TABLE "public"."long_proposals" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "vod_id" UUID NOT NULL,
    "origin" VARCHAR(10) NOT NULL DEFAULT 'manual',
    "status" VARCHAR(10) NOT NULL DEFAULT 'proposed',
    "title" VARCHAR(100) NOT NULL,
    "theme" VARCHAR(160),
    "why" TEXT,
    "score" DOUBLE PRECISION,
    "start_sec" DOUBLE PRECISION NOT NULL,
    "end_sec" DOUBLE PRECISION NOT NULL,
    "clip_job_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "long_proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "long_proposals_clip_job_id_key" ON "public"."long_proposals"("clip_job_id");
CREATE INDEX "long_proposals_channel_id_status_idx" ON "public"."long_proposals"("channel_id", "status");

ALTER TABLE "public"."long_proposals" ADD CONSTRAINT "long_proposals_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."long_proposals" ADD CONSTRAINT "long_proposals_vod_id_fkey" FOREIGN KEY ("vod_id") REFERENCES "public"."vods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."long_proposals" ADD CONSTRAINT "long_proposals_clip_job_id_fkey" FOREIGN KEY ("clip_job_id") REFERENCES "public"."clip_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
