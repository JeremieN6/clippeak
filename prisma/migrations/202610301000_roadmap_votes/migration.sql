-- Page « Prochainement » : fonctions, blocs de vote, votes et idees. Additive (4 tables), aucune donnee existante touchee.

CREATE TABLE "public"."roadmap_features" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(400) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'backlog',
    "carried_votes" INTEGER NOT NULL DEFAULT 0,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "roadmap_features_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."roadmap_blocks" (
    "id" UUID NOT NULL,
    "feature_a_id" UUID NOT NULL,
    "feature_b_id" UUID NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'open',
    "ends_at" TIMESTAMP(3) NOT NULL,
    "winner_id" UUID,
    "decided_by" VARCHAR(8),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    CONSTRAINT "roadmap_blocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."roadmap_votes" (
    "id" UUID NOT NULL,
    "block_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "feature_id" UUID NOT NULL,
    "result_seen" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "roadmap_votes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."roadmap_ideas" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "roadmap_ideas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roadmap_features_slug_key" ON "public"."roadmap_features"("slug");
CREATE INDEX "roadmap_blocks_status_ends_at_idx" ON "public"."roadmap_blocks"("status", "ends_at");
CREATE UNIQUE INDEX "roadmap_votes_block_id_channel_id_key" ON "public"."roadmap_votes"("block_id", "channel_id");
CREATE INDEX "roadmap_ideas_status_created_at_idx" ON "public"."roadmap_ideas"("status", "created_at");

ALTER TABLE "public"."roadmap_blocks" ADD CONSTRAINT "roadmap_blocks_feature_a_id_fkey" FOREIGN KEY ("feature_a_id") REFERENCES "public"."roadmap_features"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."roadmap_blocks" ADD CONSTRAINT "roadmap_blocks_feature_b_id_fkey" FOREIGN KEY ("feature_b_id") REFERENCES "public"."roadmap_features"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."roadmap_votes" ADD CONSTRAINT "roadmap_votes_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "public"."roadmap_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."roadmap_votes" ADD CONSTRAINT "roadmap_votes_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."roadmap_votes" ADD CONSTRAINT "roadmap_votes_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "public"."roadmap_features"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."roadmap_ideas" ADD CONSTRAINT "roadmap_ideas_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fonctions de depart (choix du porteur) ; le premier bloc est lance depuis /admin.
INSERT INTO "public"."roadmap_features" ("id", "slug", "title", "description") VALUES
  (gen_random_uuid(), 'tiktok', 'Publier sur TikTok', 'Envoie tes clips approuvés directement sur ton compte TikTok, à l’heure que tu choisis.'),
  (gen_random_uuid(), 'instagram', 'Publier sur Instagram Reels', 'Envoie tes clips approuvés sur ton compte Instagram professionnel, en Reels.'),
  (gen_random_uuid(), 'stats', 'Statistiques par plateforme', 'Vues et performances de chaque clip publié, réunies dans ton tableau de bord.');
