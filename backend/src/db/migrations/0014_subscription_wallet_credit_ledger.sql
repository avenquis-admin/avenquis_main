ALTER TABLE "credit_wallets" ADD COLUMN "subscription_id" integer;
--> statement-breakpoint
UPDATE "credit_wallets" AS wallet
SET "subscription_id" = subscription."id"
FROM "platform_subscriptions" AS subscription
WHERE subscription."access_request_id" = wallet."access_request_id";
--> statement-breakpoint
ALTER TABLE "credit_wallets" ALTER COLUMN "subscription_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_subscription_id_platform_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "platform_subscriptions"("id");
--> statement-breakpoint
CREATE UNIQUE INDEX "credit_wallets_subscription_id_unique" ON "credit_wallets" ("subscription_id");
--> statement-breakpoint
UPDATE "credit_ledger" SET "entry_type" = 'BONUS' WHERE "entry_type" = 'INITIAL_ALLOCATION';
--> statement-breakpoint
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_nonnegative_balance" CHECK ("balance" >= 0);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_entry_type" CHECK ("entry_type" IN ('PURCHASE', 'USAGE', 'BONUS', 'ADJUSTMENT', 'REFUND', 'EXPIRY'));
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_nonzero_amount" CHECK ("amount" <> 0);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_nonnegative_balance_after" CHECK ("balance_after" >= 0);
--> statement-breakpoint
CREATE TABLE "usage_events" (
  "id" serial PRIMARY KEY,
  "wallet_id" integer NOT NULL REFERENCES "credit_wallets"("id") ON DELETE CASCADE,
  "subscription_id" integer NOT NULL REFERENCES "platform_subscriptions"("id"),
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "firm_id" integer REFERENCES "firms"("id"),
  "service" text NOT NULL,
  "units" integer NOT NULL,
  "credits_charged" integer NOT NULL,
  "idempotency_key" text NOT NULL,
  "correlation_id" text NOT NULL,
  "metadata" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "usage_events_positive_units" CHECK ("units" > 0),
  CONSTRAINT "usage_events_positive_credits" CHECK ("credits_charged" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "usage_events_idempotency_key_unique" ON "usage_events" ("idempotency_key");
--> statement-breakpoint
CREATE INDEX "usage_events_wallet_created_at_idx" ON "usage_events" ("wallet_id", "created_at");
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "usage_event_id" integer;
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "actor_user_id" integer;
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "firm_id" integer;
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "correlation_id" text;
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "metadata" text;
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_usage_event_id_usage_events_id_fk" FOREIGN KEY ("usage_event_id") REFERENCES "usage_events"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "firms"("id");
--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_usage_event_id_unique" ON "credit_ledger" ("usage_event_id") WHERE "usage_event_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "credit_ledger_wallet_created_at_idx" ON "credit_ledger" ("wallet_id", "created_at");
