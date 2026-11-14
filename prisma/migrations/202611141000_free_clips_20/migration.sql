-- Gratuit : 20 clips par mois au lieu de 40 (decision du porteur, 2026-11-14).
-- Valeur par defaut pour les nouvelles chaines, et passage a 20 des chaines qui ont encore l'ancien defaut de 40.
-- ATTENTION : modifie des donnees (les plafonds de 40 deviennent 20). Les plafonds reglables par l'admin ailleurs que 40 ne changent pas.
ALTER TABLE "public"."streamer_settings" ALTER COLUMN "monthly_clip_quota" SET DEFAULT 20;
UPDATE "public"."streamer_settings" SET "monthly_clip_quota" = 20 WHERE "monthly_clip_quota" = 40;
