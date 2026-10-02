ALTER TABLE "users" ADD COLUMN "full_name" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_role" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "provisioning_request_id" integer;
--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "provisioning_request_id" integer;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "provisioning_idempotency_key" text;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "provisioning_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "provisioning_started_at" timestamp;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "provisioned_at" timestamp;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "provisioning_error" text;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "provisioned_user_id" integer;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "provisioned_firm_id" integer;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "subscription_id" integer;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "wallet_id" integer;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "activation_token_id" integer;
--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ALTER COLUMN "firm_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "user_id" integer REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "owner_type" text DEFAULT 'firm' NOT NULL;
--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "access_request_id" integer;
--> statement-breakpoint
CREATE TABLE "credit_wallets" (
  "id" serial PRIMARY KEY,
  "owner_type" text NOT NULL,
  "user_id" integer REFERENCES "users"("id"),
  "firm_id" integer REFERENCES "firms"("id"),
  "access_request_id" integer NOT NULL,
  "balance" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'pending_activation' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "credit_wallets_exactly_one_owner" CHECK (("user_id" IS NOT NULL)::int + ("firm_id" IS NOT NULL)::int = 1)
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
  "id" serial PRIMARY KEY,
  "wallet_id" integer NOT NULL REFERENCES "credit_wallets"("id") ON DELETE CASCADE,
  "entry_type" text NOT NULL,
  "amount" integer NOT NULL,
  "balance_after" integer NOT NULL,
  "idempotency_key" text NOT NULL,
  "reference_type" text,
  "reference_id" text,
  "reason" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activation_tokens" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "access_request_id" integer NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_provisioning_request_id_access_requests_id_fk" FOREIGN KEY ("provisioning_request_id") REFERENCES "access_requests"("id");
--> statement-breakpoint
ALTER TABLE "firms" ADD CONSTRAINT "firms_provisioning_request_id_access_requests_id_fk" FOREIGN KEY ("provisioning_request_id") REFERENCES "access_requests"("id");
--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_access_request_id_access_requests_id_fk" FOREIGN KEY ("access_request_id") REFERENCES "access_requests"("id");
--> statement-breakpoint
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_access_request_id_access_requests_id_fk" FOREIGN KEY ("access_request_id") REFERENCES "access_requests"("id");
--> statement-breakpoint
ALTER TABLE "activation_tokens" ADD CONSTRAINT "activation_tokens_access_request_id_access_requests_id_fk" FOREIGN KEY ("access_request_id") REFERENCES "access_requests"("id");
--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_provisioned_user_id_users_id_fk" FOREIGN KEY ("provisioned_user_id") REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_provisioned_firm_id_firms_id_fk" FOREIGN KEY ("provisioned_firm_id") REFERENCES "firms"("id");
--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_subscription_id_platform_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "platform_subscriptions"("id");
--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_wallet_id_credit_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "credit_wallets"("id");
--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_activation_token_id_activation_tokens_id_fk" FOREIGN KEY ("activation_token_id") REFERENCES "activation_tokens"("id");
--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_exactly_one_owner" CHECK (("user_id" IS NOT NULL)::int + ("firm_id" IS NOT NULL)::int = 1);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_provisioning_request_id_unique" ON "users" ("provisioning_request_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "firms_provisioning_request_id_unique" ON "firms" ("provisioning_request_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "access_requests_provisioning_idempotency_key_unique" ON "access_requests" ("provisioning_idempotency_key") WHERE "provisioning_idempotency_key" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_subscriptions_user_id_unique" ON "platform_subscriptions" ("user_id") WHERE "user_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_subscriptions_access_request_id_unique" ON "platform_subscriptions" ("access_request_id") WHERE "access_request_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "credit_wallets_access_request_id_unique" ON "credit_wallets" ("access_request_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "credit_wallets_user_id_unique" ON "credit_wallets" ("user_id") WHERE "user_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "credit_wallets_firm_id_unique" ON "credit_wallets" ("firm_id") WHERE "firm_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_idempotency_key_unique" ON "credit_ledger" ("idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "activation_tokens_access_request_id_unique" ON "activation_tokens" ("access_request_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "activation_tokens_token_hash_unique" ON "activation_tokens" ("token_hash");
