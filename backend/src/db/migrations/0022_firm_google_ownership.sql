CREATE TABLE IF NOT EXISTS "firm_google_connections" (
  "id" TEXT PRIMARY KEY DEFAULT ('fgc-' || gen_random_uuid()::text),
  "firm_id" INTEGER NOT NULL REFERENCES "firms"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL CHECK ("provider" IN ('GMAIL','DRIVE')),
  "connected_account_email" TEXT NOT NULL,
  "scopes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "encrypted_token_ciphertext" TEXT NOT NULL,
  "token_iv" TEXT NOT NULL,
  "token_auth_tag" TEXT NOT NULL,
  "token_key_version" TEXT NOT NULL,
  "token_expires_at" TIMESTAMPTZ,
  "status" TEXT NOT NULL DEFAULT 'CONNECTED' CHECK ("status" IN ('CONNECTED','REVOKED','ERROR')),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("firm_id", "provider")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "firm_google_connections_firm_id_idx"
  ON "firm_google_connections" ("firm_id");
--> statement-breakpoint
ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "drive_file_id" TEXT,
  ADD COLUMN IF NOT EXISTS "drive_folder_id" TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_drive_file_id_idx"
  ON "documents" ("firm_id", "drive_file_id")
  WHERE "drive_file_id" IS NOT NULL;
