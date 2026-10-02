ALTER TABLE "access_requests" ALTER COLUMN "status" DROP DEFAULT;
--> statement-breakpoint
UPDATE "access_requests" SET "status" = 'pending' WHERE "status" = 'reviewing';
--> statement-breakpoint
ALTER TABLE "access_requests" ALTER COLUMN "status" TYPE text USING "status"::text;
--> statement-breakpoint
DROP TYPE "access_request_status";
--> statement-breakpoint
CREATE TYPE "access_request_status" AS ENUM ('pending', 'approved', 'rejected', 'provisioning', 'provisioned', 'failed', 'suspended');
--> statement-breakpoint
ALTER TABLE "access_requests" ALTER COLUMN "status" TYPE "access_request_status" USING "status"::"access_request_status";
--> statement-breakpoint
ALTER TABLE "access_requests" ALTER COLUMN "status" SET DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "assigned_role" text;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "assigned_firm_id" text;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "reviewer" text;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "reviewer_id" text;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "reviewer_platform_role" text;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "review_reason" text;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "internal_note" text;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "correlation_id" text;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "reviewed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "access_requests_correlation_id_unique" ON "access_requests" ("correlation_id") WHERE "correlation_id" IS NOT NULL;
