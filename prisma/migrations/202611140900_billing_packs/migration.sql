-- Packs de 120 clips (quantite de l'abonnement Stripe) et rythme de facturation mensuel / annuel (additive : les abonnements existants valent 1 pack).
ALTER TABLE "public"."channel_billing" ADD COLUMN "packs" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "public"."channel_billing" ADD COLUMN "billing_interval" VARCHAR(8);
