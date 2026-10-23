-- AlterTable
ALTER TABLE "public"."moments" ADD COLUMN     "ai_score" DOUBLE PRECISION,
ADD COLUMN     "before_peak" TEXT,
ADD COLUMN     "category" VARCHAR(60),
ADD COLUMN     "hook" TEXT,
ADD COLUMN     "kind" VARCHAR(20),
ADD COLUMN     "rationale" TEXT,
ADD COLUMN     "scorer" VARCHAR(20),
ADD COLUMN     "transcript" JSONB;

-- AlterTable
ALTER TABLE "public"."clip_jobs" ADD COLUMN     "end_sec" DOUBLE PRECISION,
ADD COLUMN     "hashtags" TEXT,
ADD COLUMN     "illustrations" JSONB,
ADD COLUMN     "keep_ranges" JSONB,
ADD COLUMN     "notified_at" TIMESTAMP(3),
ADD COLUMN     "qc" JSONB,
ADD COLUMN     "review_note" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "start_sec" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "public"."streamer_styles" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "config" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streamer_styles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."streamer_assets" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "filename" VARCHAR(200) NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "streamer_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reference_clips" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "twitch_clip_id" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "view_count" INTEGER NOT NULL,
    "duration_sec" DOUBLE PRECISION NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_clips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "streamer_styles_channel_id_key" ON "public"."streamer_styles"("channel_id");

-- CreateIndex
CREATE INDEX "streamer_assets_channel_id_kind_idx" ON "public"."streamer_assets"("channel_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "reference_clips_twitch_clip_id_key" ON "public"."reference_clips"("twitch_clip_id");

-- CreateIndex
CREATE INDEX "reference_clips_channel_id_idx" ON "public"."reference_clips"("channel_id");

-- AddForeignKey
ALTER TABLE "public"."streamer_styles" ADD CONSTRAINT "streamer_styles_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."streamer_assets" ADD CONSTRAINT "streamer_assets_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reference_clips" ADD CONSTRAINT "reference_clips_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

