ALTER TABLE "access_requests" ADD COLUMN "activation_status" text;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "activation_delivery_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "activation_delivery_started_at" timestamp;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "activation_delivered_at" timestamp;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "activation_delivery_error" text;
--> statement-breakpoint
ALTER TABLE "activation_tokens" ADD COLUMN "delivery_idempotency_key" text;
--> statement-breakpoint
ALTER TABLE "activation_tokens" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "activation_tokens_delivery_idempotency_key_unique" ON "activation_tokens" ("delivery_idempotency_key") WHERE "delivery_idempotency_key" IS NOT NULL;
