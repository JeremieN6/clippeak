-- CreateTable
CREATE TABLE "public"."platform_connections" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "platform" VARCHAR(12) NOT NULL,
    "account_name" VARCHAR(120),
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT,
    "expires_at" TIMESTAMP(3),
    "scopes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."publications" (
    "id" UUID NOT NULL,
    "clip_job_id" UUID NOT NULL,
    "platform" VARCHAR(12) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'scheduled',
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "external_id" VARCHAR(80),
    "external_url" VARCHAR(300),
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_connections_channel_id_platform_key" ON "public"."platform_connections"("channel_id", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "publications_clip_job_id_platform_key" ON "public"."publications"("clip_job_id", "platform");

-- CreateIndex
CREATE INDEX "publications_status_scheduled_at_idx" ON "public"."publications"("status", "scheduled_at");

-- AddForeignKey
ALTER TABLE "public"."platform_connections" ADD CONSTRAINT "platform_connections_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."publications" ADD CONSTRAINT "publications_clip_job_id_fkey" FOREIGN KEY ("clip_job_id") REFERENCES "public"."clip_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
