-- Plafond mensuel de clips par chaine (additive : 1 colonne). Les chaines existantes recoivent le defaut (40) ; NULL = illimite.
ALTER TABLE "public"."streamer_settings" ADD COLUMN "monthly_clip_quota" INTEGER DEFAULT 40;
