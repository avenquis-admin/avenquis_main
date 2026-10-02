ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "is_archived" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;
--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN IF NOT EXISTS "is_archived" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "people_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "firm_id" integer NOT NULL,
  "user_id" integer,
  "employee_code" text,
  "full_name" text NOT NULL,
  "type" text DEFAULT 'STAFF' NOT NULL,
  "designation" text,
  "department" text,
  "reporting_manager_id" integer,
  "phone" text,
  "joining_date" timestamp,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "firm_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "date" timestamp NOT NULL,
  "check_in" timestamp,
  "check_out" timestamp,
  "status" text DEFAULT 'PRESENT' NOT NULL,
  "location" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "performance_reviews" (
  "id" serial PRIMARY KEY NOT NULL,
  "firm_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "reviewer_id" integer,
  "cycle" text NOT NULL,
  "technical_quality" integer,
  "documentation_quality" integer,
  "timeliness" integer,
  "teamwork" integer,
  "feedback" text,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "firm_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "period" text NOT NULL,
  "gross_amount" text NOT NULL,
  "allowance_amount" text DEFAULT '0.00' NOT NULL,
  "deduction_amount" text DEFAULT '0.00' NOT NULL,
  "net_amount" text NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "firm_id" integer NOT NULL,
  "title" text NOT NULL,
  "event_type" text DEFAULT 'GENERAL' NOT NULL,
  "starts_at" timestamp NOT NULL,
  "ends_at" timestamp,
  "client_id" integer,
  "engagement_id" integer,
  "assigned_user_id" integer,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_portal_access" (
  "id" serial PRIMARY KEY NOT NULL,
  "firm_id" integer NOT NULL,
  "client_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "status" text DEFAULT 'INVITED' NOT NULL,
  "invited_at" timestamp DEFAULT now() NOT NULL,
  "activated_at" timestamp,
  "revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "firm_id" integer NOT NULL,
  "client_id" integer NOT NULL,
  "engagement_id" integer,
  "title" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'OPEN' NOT NULL,
  "due_date" timestamp,
  "created_by_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "people_profiles" ADD CONSTRAINT "people_profiles_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "people_profiles" ADD CONSTRAINT "people_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "people_profiles" ADD CONSTRAINT "people_profiles_reporting_manager_id_users_id_fk" FOREIGN KEY ("reporting_manager_id") REFERENCES "public"."users"("id");
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id");
--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id");
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id");
--> statement-breakpoint
ALTER TABLE "client_portal_access" ADD CONSTRAINT "client_portal_access_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "client_portal_access" ADD CONSTRAINT "client_portal_access_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "client_portal_access" ADD CONSTRAINT "client_portal_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id");
--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id");
--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
