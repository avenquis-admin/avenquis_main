ALTER TABLE "access_requests" ALTER COLUMN "firm_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "mobile" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "professional_role" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "professional_registration" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "reason_use_case" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "partner_name" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "practice_type" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "firm_size" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "audit_metadata" text;--> statement-breakpoint
UPDATE "access_requests" SET
  "mobile" = COALESCE("mobile", 'legacy-not-provided'),
  "reason_use_case" = COALESCE("reason_use_case", 'Legacy access request'),
  "audit_metadata" = COALESCE("audit_metadata", '{"source":"legacy"}');--> statement-breakpoint
ALTER TABLE "access_requests" ALTER COLUMN "mobile" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "access_requests" ALTER COLUMN "reason_use_case" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "access_requests" ALTER COLUMN "audit_metadata" SET NOT NULL;
