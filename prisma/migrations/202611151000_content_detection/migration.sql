-- Detection des clips par le contenu du live : reglage de detection et transcription partagee d'un live (additive).
ALTER TABLE "public"."streamer_settings" ADD COLUMN "detection_mode" VARCHAR(10) NOT NULL DEFAULT 'both';

CREATE TABLE "public"."vod_transcripts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vod_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "segments" JSONB NOT NULL DEFAULT '[]',
    "transcribed_sec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "detected_sec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "audio_sec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "work_sec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "provider" VARCHAR(12),
    "error" TEXT,
    "done_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vod_transcripts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vod_transcripts_vod_id_key" ON "public"."vod_transcripts"("vod_id");
CREATE INDEX "vod_transcripts_channel_id_created_at_idx" ON "public"."vod_transcripts"("channel_id", "created_at");

ALTER TABLE "public"."vod_transcripts" ADD CONSTRAINT "vod_transcripts_vod_id_fkey" FOREIGN KEY ("vod_id") REFERENCES "public"."vods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."vod_transcripts" ADD CONSTRAINT "vod_transcripts_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
