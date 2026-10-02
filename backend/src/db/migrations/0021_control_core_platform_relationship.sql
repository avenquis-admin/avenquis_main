ALTER TABLE "firms"
  ADD COLUMN IF NOT EXISTS "control_firm_id" TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "firms_control_firm_id_unique"
  ON "firms" ("control_firm_id")
  WHERE "control_firm_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "platform_user_id" TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_platform_user_id_unique"
  ON "users" ("platform_user_id")
  WHERE "platform_user_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "firm_entitlements" (
  "firm_id" INTEGER PRIMARY KEY REFERENCES "firms"("id") ON DELETE CASCADE,
  "control_firm_id" TEXT NOT NULL UNIQUE,
  "subscription_id" TEXT NOT NULL,
  "plan_code" TEXT NOT NULL,
  "subscription_status" TEXT NOT NULL CHECK ("subscription_status" IN ('active','trialing','past_due','suspended','canceled')),
  "entitlement_version" INTEGER NOT NULL CHECK ("entitlement_version" > 0),
  "modules" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "limits" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "effective_from" TIMESTAMPTZ NOT NULL,
  "effective_until" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "firm_entitlements_subscription_status_idx"
  ON "firm_entitlements" ("subscription_status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "firm_subscriptions" (
  "firm_id" INTEGER PRIMARY KEY REFERENCES "firms"("id") ON DELETE CASCADE,
  "control_firm_id" TEXT NOT NULL UNIQUE,
  "subscription_id" TEXT NOT NULL UNIQUE,
  "subscription_status" TEXT NOT NULL CHECK ("subscription_status" IN ('active','trialing','past_due','suspended','canceled')),
  "entitlement_version" INTEGER NOT NULL CHECK ("entitlement_version" > 0),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "firm_subscriptions_status_idx"
  ON "firm_subscriptions" ("subscription_status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provisioning_receipts" (
  "provisioning_operation_id" TEXT PRIMARY KEY,
  "event_id" TEXT NOT NULL UNIQUE,
  "idempotency_key" TEXT NOT NULL UNIQUE,
  "correlation_id" TEXT NOT NULL,
  "contract_version" TEXT NOT NULL,
  "action" TEXT NOT NULL CHECK ("action" IN ('firm.provision','firm.activate','firm.suspend','user.provision','user.disable','entitlements.replace','subscription.status_changed')),
  "control_firm_id" TEXT NOT NULL,
  "request_fingerprint" TEXT NOT NULL,
  "result" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "processed_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provisioning_receipts_correlation_id_idx"
  ON "provisioning_receipts" ("correlation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provisioning_receipts_control_firm_id_idx"
  ON "provisioning_receipts" ("control_firm_id");
