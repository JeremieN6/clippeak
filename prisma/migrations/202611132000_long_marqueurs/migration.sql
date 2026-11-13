-- Extraits longs : commandes du chat (debut / fin) et lecture du chat des VODs (additive).
ALTER TABLE "public"."streamer_settings" ADD COLUMN "long_start_command" VARCHAR(21) NOT NULL DEFAULT '!extrait';
ALTER TABLE "public"."streamer_settings" ADD COLUMN "long_end_command" VARCHAR(21) NOT NULL DEFAULT '!fin';
ALTER TABLE "public"."streamer_settings" ADD COLUMN "long_mods_allowed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."vods" ADD COLUMN "marker_scan_sec" DOUBLE PRECISION;
ALTER TABLE "public"."vods" ADD COLUMN "markers_done_at" TIMESTAMP(3);
