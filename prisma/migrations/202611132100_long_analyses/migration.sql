-- Analyse d'un live entier pour proposer des extraits longs (additive).
CREATE TABLE "public"."long_analyses" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "vod_id" UUID NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'queued',
    "transcribed_sec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duration_sec" DOUBLE PRECISION,
    "proposals_count" INTEGER NOT NULL DEFAULT 0,
    "transcript" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "long_analyses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "long_analyses_vod_id_key" ON "public"."long_analyses"("vod_id");
CREATE INDEX "long_analyses_status_created_at_idx" ON "public"."long_analyses"("status", "created_at");

ALTER TABLE "public"."long_analyses" ADD CONSTRAINT "long_analyses_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."long_analyses" ADD CONSTRAINT "long_analyses_vod_id_fkey" FOREIGN KEY ("vod_id") REFERENCES "public"."vods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
