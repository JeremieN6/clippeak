-- Vagues d'invitations automatiques et parrainage (additive : colonnes facultatives et nouvelles tables, aucune donnee modifiee).
ALTER TABLE "public"."channels" ADD COLUMN "referral_code" VARCHAR(12);
ALTER TABLE "public"."channels" ADD COLUMN "referred_by_id" UUID;
CREATE UNIQUE INDEX "channels_referral_code_key" ON "public"."channels"("referral_code");
ALTER TABLE "public"."channels" ADD CONSTRAINT "channels_referred_by_id_fkey" FOREIGN KEY ("referred_by_id") REFERENCES "public"."channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."channel_invites" ADD COLUMN "source" VARCHAR(10) NOT NULL DEFAULT 'manual';
ALTER TABLE "public"."channel_invites" ADD COLUMN "referred_by_channel_id" UUID;

ALTER TABLE "public"."access_requests" ADD COLUMN "referred_by_channel_id" UUID;
CREATE INDEX "access_requests_created_at_idx" ON "public"."access_requests"("created_at");

CREATE TABLE "public"."invitation_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "waves_enabled" BOOLEAN NOT NULL DEFAULT false,
    "daily_cap" INTEGER NOT NULL DEFAULT 20,
    "referral_bonus_cap" INTEGER NOT NULL DEFAULT 25,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."referral_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel_id" UUID NOT NULL,
    "other_channel_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "clips" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referral_grants_channel_id_other_channel_id_kind_key" ON "public"."referral_grants"("channel_id", "other_channel_id", "kind");
CREATE INDEX "referral_grants_channel_id_created_at_idx" ON "public"."referral_grants"("channel_id", "created_at");
ALTER TABLE "public"."referral_grants" ADD CONSTRAINT "referral_grants_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."referral_grants" ADD CONSTRAINT "referral_grants_other_channel_id_fkey" FOREIGN KEY ("other_channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
