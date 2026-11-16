-- Identifiant du compte cote plateforme (Instagram : identifiant du compte, necessaire pour publier et pour les rappels de Meta) (additive).
ALTER TABLE "public"."platform_connections" ADD COLUMN "external_id" VARCHAR(40);
