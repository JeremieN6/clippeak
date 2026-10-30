-- Demandes d'acces des streamers non invites (additive).
CREATE TABLE "public"."access_requests" (
    "id" UUID NOT NULL,
    "twitch_id" VARCHAR(40) NOT NULL,
    "twitch_login" VARCHAR(25) NOT NULL,
    "display_name" VARCHAR(60),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "access_requests_twitch_id_key" ON "public"."access_requests"("twitch_id");
