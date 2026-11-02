-- Reglages propres a une plateforme (TikTok : visibilite, commentaires, duo, stitch, contenu commercial) (additive).
ALTER TABLE "public"."publications" ADD COLUMN "options" JSONB;
