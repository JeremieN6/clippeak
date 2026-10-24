-- CreateTable
CREATE TABLE "public"."reference_items" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "parent_id" UUID,
    "kind" VARCHAR(10) NOT NULL DEFAULT 'clip',
    "source" VARCHAR(12) NOT NULL,
    "url" VARCHAR(500),
    "file_path" VARCHAR(500),
    "title" VARCHAR(255),
    "duration_sec" DOUBLE PRECISION,
    "view_count" DOUBLE PRECISION,
    "like_count" DOUBLE PRECISION,
    "comment_count" DOUBLE PRECISION,
    "share_count" DOUBLE PRECISION,
    "status" VARCHAR(12) NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "error" TEXT,
    "transcript" JSONB,
    "analysis" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzed_at" TIMESTAMP(3),

    CONSTRAINT "reference_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reference_items_channel_id_status_idx" ON "public"."reference_items"("channel_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reference_items_channel_id_url_key" ON "public"."reference_items"("channel_id", "url");

-- AddForeignKey
ALTER TABLE "public"."reference_items" ADD CONSTRAINT "reference_items_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

