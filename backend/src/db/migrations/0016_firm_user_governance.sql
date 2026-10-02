ALTER TABLE "firm_users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "firm_users" ADD COLUMN "revoked_at" timestamp;
--> statement-breakpoint
ALTER TABLE "firm_users" ADD COLUMN "revoked_reason" text;
--> statement-breakpoint
ALTER TABLE "firm_users" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_governance_status" CHECK ("status" IN ('pending_activation', 'active', 'disabled'));
--> statement-breakpoint
ALTER TABLE "firms" ADD CONSTRAINT "firms_governance_status" CHECK ("status" IN ('pending_activation', 'active', 'suspended'));
--> statement-breakpoint
ALTER TABLE "firm_users" ADD CONSTRAINT "firm_users_governance_status" CHECK ("status" IN ('active', 'revoked'));
--> statement-breakpoint
CREATE INDEX "firm_users_status_idx" ON "firm_users" ("status");
