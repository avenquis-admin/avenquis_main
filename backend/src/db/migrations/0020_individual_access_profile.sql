ALTER TABLE "access_requests" ADD COLUMN IF NOT EXISTS "principal_name" text;
ALTER TABLE "access_requests" ADD COLUMN IF NOT EXISTS "articleship_registration_date" text;
ALTER TABLE "access_requests" ADD COLUMN IF NOT EXISTS "articleship_period" text;
ALTER TABLE "access_requests" ADD COLUMN IF NOT EXISTS "current_ca_level" text;
ALTER TABLE "access_requests" ADD COLUMN IF NOT EXISTS "exam_progress_status" text;
ALTER TABLE "access_requests" ADD COLUMN IF NOT EXISTS "access_reasons" text;
ALTER TABLE "access_requests" ADD COLUMN IF NOT EXISTS "other_reason" text;
ALTER TABLE "access_requests" ADD COLUMN IF NOT EXISTS "additional_note" text;
