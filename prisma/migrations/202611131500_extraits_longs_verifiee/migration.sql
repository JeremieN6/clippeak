-- Extraits longs : le streamer confirme que sa chaine YouTube est verifiee (plus de 15 minutes) (additive).
ALTER TABLE "public"."streamer_settings" ADD COLUMN "long_extract_verified" BOOLEAN NOT NULL DEFAULT false;
