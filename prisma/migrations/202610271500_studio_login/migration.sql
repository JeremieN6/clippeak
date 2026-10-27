-- CreateTable
CREATE TABLE "public"."channel_invites" (
    "id" UUID NOT NULL,
    "twitch_login" VARCHAR(25) NOT NULL,
    "twitch_id" VARCHAR(40),
    "note" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "channel_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."studio_sessions" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channel_invites_twitch_login_key" ON "public"."channel_invites"("twitch_login");

-- CreateIndex
CREATE UNIQUE INDEX "channel_invites_twitch_id_key" ON "public"."channel_invites"("twitch_id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_sessions_token_hash_key" ON "public"."studio_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "studio_sessions_channel_id_idx" ON "public"."studio_sessions"("channel_id");

-- AddForeignKey
ALTER TABLE "public"."studio_sessions" ADD CONSTRAINT "studio_sessions_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
