-- Abonnement Stripe par chaine (additive : 1 table). Aucune donnee de carte.
CREATE TABLE "public"."channel_billing" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "stripe_customer_id" VARCHAR(80),
    "stripe_subscription_id" VARCHAR(80),
    "plan" VARCHAR(12) NOT NULL DEFAULT 'free',
    "status" VARCHAR(24),
    "current_period_end" TIMESTAMP(3),
    "last_event_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_billing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_billing_channel_id_key" ON "public"."channel_billing"("channel_id");
CREATE UNIQUE INDEX "channel_billing_stripe_customer_id_key" ON "public"."channel_billing"("stripe_customer_id");

ALTER TABLE "public"."channel_billing" ADD CONSTRAINT "channel_billing_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
