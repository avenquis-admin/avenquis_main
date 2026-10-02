ALTER TABLE "firms" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "working_papers" ADD COLUMN IF NOT EXISTS "is_archived" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "working_papers" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;
