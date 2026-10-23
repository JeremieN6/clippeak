-- CreateEnum
CREATE TYPE "public"."VodStatus" AS ENUM ('live', 'ended', 'analyzing', 'done', 'failed');

-- CreateEnum
CREATE TYPE "public"."VodSource" AS ENUM ('auto', 'manual');

-- CreateEnum
CREATE TYPE "public"."MomentStatus" AS ENUM ('candidate', 'validated', 'rejected');

-- CreateEnum
CREATE TYPE "public"."ClipJobStatus" AS ENUM ('queued', 'rendering', 'review', 'approved', 'rejected', 'failed');

-- CreateTable
CREATE TABLE "public"."channels" (
    "id" UUID NOT NULL,
    "twitch_id" VARCHAR(40) NOT NULL,
    "login" VARCHAR(60) NOT NULL,
    "display_name" VARCHAR(80) NOT NULL,
    "auto_clip" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."streamer_settings" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY['mdr', 'ptdr', 'lol', 'omg', 'xd', 'kekw']::TEXT[],
    "clip_min_sec" INTEGER NOT NULL DEFAULT 30,
    "clip_max_sec" INTEGER NOT NULL DEFAULT 60,
    "subtitles" BOOLEAN NOT NULL DEFAULT true,
    "accent_color" VARCHAR(9) NOT NULL DEFAULT '#FFFFFF',
    "highlight_color" VARCHAR(9) NOT NULL DEFAULT '#FFD400',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streamer_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vods" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "twitch_vod_id" VARCHAR(40) NOT NULL,
    "url" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255),
    "status" "public"."VodStatus" NOT NULL DEFAULT 'live',
    "source" "public"."VodSource" NOT NULL DEFAULT 'auto',
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."moments" (
    "id" UUID NOT NULL,
    "vod_id" UUID NOT NULL,
    "start_sec" DOUBLE PRECISION NOT NULL,
    "end_sec" DOUBLE PRECISION NOT NULL,
    "peak_sec" DOUBLE PRECISION NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "signals" JSONB NOT NULL,
    "status" "public"."MomentStatus" NOT NULL DEFAULT 'candidate',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."clip_jobs" (
    "id" UUID NOT NULL,
    "moment_id" UUID NOT NULL,
    "status" "public"."ClipJobStatus" NOT NULL DEFAULT 'queued',
    "batch" INTEGER,
    "title" VARCHAR(255),
    "caption" TEXT,
    "output_path" VARCHAR(500),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clip_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channels_twitch_id_key" ON "public"."channels"("twitch_id");

-- CreateIndex
CREATE UNIQUE INDEX "streamer_settings_channel_id_key" ON "public"."streamer_settings"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "vods_twitch_vod_id_key" ON "public"."vods"("twitch_vod_id");

-- CreateIndex
CREATE INDEX "vods_channel_id_idx" ON "public"."vods"("channel_id");

-- CreateIndex
CREATE INDEX "moments_vod_id_idx" ON "public"."moments"("vod_id");

-- CreateIndex
CREATE INDEX "clip_jobs_status_idx" ON "public"."clip_jobs"("status");

-- AddForeignKey
ALTER TABLE "public"."streamer_settings" ADD CONSTRAINT "streamer_settings_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vods" ADD CONSTRAINT "vods_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."moments" ADD CONSTRAINT "moments_vod_id_fkey" FOREIGN KEY ("vod_id") REFERENCES "public"."vods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."clip_jobs" ADD CONSTRAINT "clip_jobs_moment_id_fkey" FOREIGN KEY ("moment_id") REFERENCES "public"."moments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

