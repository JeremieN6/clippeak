-- Cloche de notifications du studio. Additive (1 table), aucune donnee existante touchee.
CREATE TABLE "public"."notifications" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(300) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_channel_id_created_at_idx" ON "public"."notifications"("channel_id", "created_at");

ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
