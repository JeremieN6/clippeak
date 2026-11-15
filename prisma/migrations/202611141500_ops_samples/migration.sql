-- Mesures de capacite du serveur (une ligne par minute, gardees 7 jours) et chronometrage du rendu des clips (additive).
ALTER TABLE "public"."clip_jobs" ADD COLUMN "render_started_at" TIMESTAMP(3);
ALTER TABLE "public"."clip_jobs" ADD COLUMN "rendered_at" TIMESTAMP(3);

CREATE TABLE "public"."ops_samples" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "load1" DOUBLE PRECISION NOT NULL,
    "load5" DOUBLE PRECISION NOT NULL,
    "cores" INTEGER NOT NULL,
    "mem_total_mb" INTEGER NOT NULL,
    "mem_free_mb" INTEGER NOT NULL,
    "clips_queued" INTEGER NOT NULL DEFAULT 0,
    "clips_rendering" INTEGER NOT NULL DEFAULT 0,
    "analyses_queued" INTEGER NOT NULL DEFAULT 0,
    "analyses_running" INTEGER NOT NULL DEFAULT 0,
    "oldest_wait_sec" INTEGER,

    CONSTRAINT "ops_samples_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ops_samples_at_idx" ON "public"."ops_samples"("at");
