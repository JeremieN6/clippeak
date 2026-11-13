-- Extraits longs YouTube (additive) : reglage par chaine et format du clip.
ALTER TABLE "public"."streamer_settings" ADD COLUMN "long_extracts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."streamer_settings" ADD COLUMN "long_extract_max_sec" INTEGER NOT NULL DEFAULT 600;
ALTER TABLE "public"."clip_jobs" ADD COLUMN "format" VARCHAR(8) NOT NULL DEFAULT 'short';
