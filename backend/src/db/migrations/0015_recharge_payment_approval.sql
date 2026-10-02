ALTER TABLE "credit_wallets" ADD COLUMN "low_balance_threshold" integer DEFAULT 200 NOT NULL;
--> statement-breakpoint
UPDATE "credit_wallets" SET "low_balance_threshold" = CASE WHEN "owner_type" = 'firm' THEN 1000 ELSE 200 END;
--> statement-breakpoint
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_nonnegative_low_balance_threshold" CHECK ("low_balance_threshold" >= 0);
--> statement-breakpoint
CREATE TABLE "recharge_requests" (
  "id" serial PRIMARY KEY,
  "wallet_id" integer NOT NULL REFERENCES "credit_wallets"("id") ON DELETE CASCADE,
  "subscription_id" integer NOT NULL REFERENCES "platform_subscriptions"("id"),
  "owner_type" text NOT NULL,
  "user_id" integer REFERENCES "users"("id"),
  "firm_id" integer REFERENCES "firms"("id"),
  "requested_by_user_id" integer NOT NULL REFERENCES "users"("id"),
  "credits_requested" integer NOT NULL,
  "payment_reference" text NOT NULL,
  "payment_method" text NOT NULL,
  "requester_note" text,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "idempotency_key" text NOT NULL,
  "reviewed_by_id" text,
  "reviewed_by_name" text,
  "reviewer_platform_role" text,
  "review_reason" text,
  "review_correlation_id" text,
  "review_idempotency_key" text,
  "reviewed_at" timestamp,
  "ledger_entry_id" integer,
  "cancelled_at" timestamp,
  "cancellation_reason" text,
  "failure_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "recharge_requests_positive_credits" CHECK ("credits_requested" > 0),
  CONSTRAINT "recharge_requests_owner_type" CHECK ("owner_type" IN ('individual', 'firm')),
  CONSTRAINT "recharge_requests_owner" CHECK (("owner_type" = 'individual' AND "user_id" IS NOT NULL AND "firm_id" IS NULL) OR ("owner_type" = 'firm' AND "firm_id" IS NOT NULL AND "user_id" IS NULL)),
  CONSTRAINT "recharge_requests_status" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'FAILED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "recharge_requests_idempotency_key_unique" ON "recharge_requests" ("idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "recharge_requests_review_idempotency_key_unique" ON "recharge_requests" ("review_idempotency_key") WHERE "review_idempotency_key" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "recharge_requests_ledger_entry_id_unique" ON "recharge_requests" ("ledger_entry_id") WHERE "ledger_entry_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "recharge_requests_wallet_payment_reference_unique" ON "recharge_requests" ("wallet_id", "payment_reference");
--> statement-breakpoint
CREATE INDEX "recharge_requests_wallet_created_at_idx" ON "recharge_requests" ("wallet_id", "created_at");
--> statement-breakpoint
CREATE INDEX "recharge_requests_status_created_at_idx" ON "recharge_requests" ("status", "created_at");
