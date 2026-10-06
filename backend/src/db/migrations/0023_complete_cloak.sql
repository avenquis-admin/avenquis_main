CREATE TYPE "public"."engagement_role" AS ENUM('PARTNER', 'MANAGER', 'SENIOR', 'JUNIOR');--> statement-breakpoint
CREATE TABLE "activation_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"access_request_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"delivery_idempotency_key" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "activation_tokens_access_request_id_unique" UNIQUE("access_request_id"),
	CONSTRAINT "activation_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "activation_tokens_delivery_idempotency_key_unique" UNIQUE("delivery_idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
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
CREATE TABLE "calendar_events" (
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
CREATE TABLE "chatbot_knowledge_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"normalized_question" text NOT NULL,
	"intent" text NOT NULL,
	"answer" text NOT NULL,
	"category" text NOT NULL,
	"tenant_id" integer,
	"user_id" integer,
	"client_id" integer,
	"engagement_id" integer,
	"role_scope" text,
	"source" text NOT NULL,
	"source_reference" text,
	"provider" text NOT NULL,
	"model" text,
	"review_status" text DEFAULT 'CANDIDATE' NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"similarity_metadata" text,
	"version" integer DEFAULT 1 NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"effective_from" timestamp,
	"effective_to" timestamp,
	"law_standard_framework" text,
	"section_paragraph_reference" text,
	"jurisdiction" text,
	"professional_effective_date" timestamp,
	"last_reviewed_at" timestamp,
	"last_used_at" timestamp,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"retired_at" timestamp,
	"retirement_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbot_usage_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"firm_id" integer,
	"wallet_id" integer,
	"usage_event_id" integer,
	"provider_mode" text NOT NULL,
	"model" text,
	"memory_hit" boolean DEFAULT false NOT NULL,
	"knowledge_item_id" integer,
	"provider_call" boolean DEFAULT false NOT NULL,
	"provider_success" boolean,
	"usage_class" text NOT NULL,
	"credits_charged" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"idempotency_key" text NOT NULL,
	"correlation_id" text NOT NULL,
	"question_fingerprint" text NOT NULL,
	"response_text" text,
	"failure_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "chatbot_usage_records_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "client_portal_access" (
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
CREATE TABLE "credit_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_id" integer NOT NULL,
	"usage_event_id" integer,
	"actor_user_id" integer,
	"firm_id" integer,
	"entry_type" text NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"reason" text NOT NULL,
	"correlation_id" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_usage_event_id_unique" UNIQUE("usage_event_id"),
	CONSTRAINT "credit_ledger_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "credit_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_type" text NOT NULL,
	"user_id" integer,
	"firm_id" integer,
	"subscription_id" integer NOT NULL,
	"access_request_id" integer NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"low_balance_threshold" integer DEFAULT 200 NOT NULL,
	"status" text DEFAULT 'pending_activation' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_wallets_subscription_id_unique" UNIQUE("subscription_id"),
	CONSTRAINT "credit_wallets_access_request_id_unique" UNIQUE("access_request_id")
);
--> statement-breakpoint
CREATE TABLE "document_requests" (
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
CREATE TABLE "engagement_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"engagement_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" "engagement_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "engagement_user_unq" UNIQUE("engagement_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "firm_entitlements" (
	"firm_id" integer PRIMARY KEY NOT NULL,
	"control_firm_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"plan_code" text NOT NULL,
	"subscription_status" text NOT NULL,
	"entitlement_version" integer NOT NULL,
	"modules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "firm_entitlements_control_firm_id_unique" UNIQUE("control_firm_id")
);
--> statement-breakpoint
CREATE TABLE "firm_google_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"provider" text NOT NULL,
	"connected_account_email" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"encrypted_token_ciphertext" text NOT NULL,
	"token_iv" text NOT NULL,
	"token_auth_tag" text NOT NULL,
	"token_key_version" text NOT NULL,
	"token_expires_at" timestamp with time zone,
	"status" text DEFAULT 'CONNECTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "firm_subscriptions" (
	"firm_id" integer PRIMARY KEY NOT NULL,
	"control_firm_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"subscription_status" text NOT NULL,
	"entitlement_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "firm_subscriptions_control_firm_id_unique" UNIQUE("control_firm_id"),
	CONSTRAINT "firm_subscriptions_subscription_id_unique" UNIQUE("subscription_id")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "payroll_records" (
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
CREATE TABLE "people_profiles" (
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
CREATE TABLE "performance_reviews" (
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
CREATE TABLE "provisioning_receipts" (
	"provisioning_operation_id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"correlation_id" text NOT NULL,
	"contract_version" text NOT NULL,
	"action" text NOT NULL,
	"control_firm_id" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provisioning_receipts_event_id_unique" UNIQUE("event_id"),
	CONSTRAINT "provisioning_receipts_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "recharge_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_id" integer NOT NULL,
	"subscription_id" integer NOT NULL,
	"owner_type" text NOT NULL,
	"user_id" integer,
	"firm_id" integer,
	"requested_by_user_id" integer NOT NULL,
	"credits_requested" integer NOT NULL,
	"payment_reference" text NOT NULL,
	"payment_method" text NOT NULL,
	"requester_note" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"idempotency_key" text NOT NULL,
	"reviewed_by_id" text,
	"reviewed_by_name" text,
	"reviewer_platform_role" text,
	"review_reason" text,
	"review_correlation_id" text,
	"review_idempotency_key" text,
	"reviewed_at" timestamp,
	"ledger_entry_id" integer,
	"cancelled_at" timestamp,
	"cancellation_reason" text,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recharge_requests_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "recharge_requests_review_idempotency_key_unique" UNIQUE("review_idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_id" integer NOT NULL,
	"subscription_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"firm_id" integer,
	"service" text NOT NULL,
	"units" integer NOT NULL,
	"credits_charged" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"correlation_id" text NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usage_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "access_requests" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "access_requests" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
DROP TYPE "public"."access_request_status";--> statement-breakpoint
CREATE TYPE "public"."access_request_status" AS ENUM('pending', 'approved', 'rejected', 'provisioning', 'provisioned', 'failed', 'suspended');--> statement-breakpoint
ALTER TABLE "access_requests" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."access_request_status";--> statement-breakpoint
ALTER TABLE "access_requests" ALTER COLUMN "status" SET DATA TYPE "public"."access_request_status" USING "status"::"public"."access_request_status";--> statement-breakpoint
ALTER TABLE "access_requests" ALTER COLUMN "firm_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ALTER COLUMN "firm_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "mobile" text NOT NULL;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "professional_role" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "professional_registration" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "principal_name" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "articleship_registration_date" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "articleship_period" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "current_ca_level" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "exam_progress_status" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "access_reasons" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "other_reason" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "additional_note" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "reason_use_case" text NOT NULL;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "partner_name" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "practice_type" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "firm_size" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "audit_metadata" text NOT NULL;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "assigned_role" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "assigned_firm_id" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "reviewer" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "reviewer_id" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "reviewer_platform_role" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "internal_note" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "correlation_id" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "provisioning_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "provisioning_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "provisioning_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "provisioned_at" timestamp;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "provisioning_error" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "provisioned_user_id" integer;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "provisioned_firm_id" integer;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "subscription_id" integer;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "wallet_id" integer;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "activation_token_id" integer;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "activation_status" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "activation_delivery_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "activation_delivery_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "activation_delivered_at" timestamp;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "activation_delivery_error" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "actor_user_id" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "actor_role_context" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "target_tenant_id" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "target_user_id" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "target_resource_type" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "target_resource_id" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "previous_state" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "new_state" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "correlation_id" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "source_application" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "drive_file_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "drive_folder_id" text;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "firm_users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "firm_users" ADD COLUMN "revoked_at" timestamp;--> statement-breakpoint
ALTER TABLE "firm_users" ADD COLUMN "revoked_reason" text;--> statement-breakpoint
ALTER TABLE "firm_users" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "provisioning_request_id" integer;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "control_firm_id" text;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "owner_type" text DEFAULT 'firm' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "access_request_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "full_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_role" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "provisioning_request_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform_user_id" text;--> statement-breakpoint
ALTER TABLE "working_papers" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "working_papers" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "activation_tokens" ADD CONSTRAINT "activation_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot_knowledge_items" ADD CONSTRAINT "chatbot_knowledge_items_tenant_id_firms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot_knowledge_items" ADD CONSTRAINT "chatbot_knowledge_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot_knowledge_items" ADD CONSTRAINT "chatbot_knowledge_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot_knowledge_items" ADD CONSTRAINT "chatbot_knowledge_items_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot_usage_records" ADD CONSTRAINT "chatbot_usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot_usage_records" ADD CONSTRAINT "chatbot_usage_records_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot_usage_records" ADD CONSTRAINT "chatbot_usage_records_wallet_id_credit_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."credit_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot_usage_records" ADD CONSTRAINT "chatbot_usage_records_usage_event_id_usage_events_id_fk" FOREIGN KEY ("usage_event_id") REFERENCES "public"."usage_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot_usage_records" ADD CONSTRAINT "chatbot_usage_records_knowledge_item_id_chatbot_knowledge_items_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."chatbot_knowledge_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_access" ADD CONSTRAINT "client_portal_access_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_access" ADD CONSTRAINT "client_portal_access_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_access" ADD CONSTRAINT "client_portal_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_wallet_id_credit_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."credit_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_usage_event_id_usage_events_id_fk" FOREIGN KEY ("usage_event_id") REFERENCES "public"."usage_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_subscription_id_platform_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."platform_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_members" ADD CONSTRAINT "engagement_members_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_members" ADD CONSTRAINT "engagement_members_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_members" ADD CONSTRAINT "engagement_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_entitlements" ADD CONSTRAINT "firm_entitlements_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_google_connections" ADD CONSTRAINT "firm_google_connections_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_subscriptions" ADD CONSTRAINT "firm_subscriptions_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_profiles" ADD CONSTRAINT "people_profiles_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_profiles" ADD CONSTRAINT "people_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_profiles" ADD CONSTRAINT "people_profiles_reporting_manager_id_users_id_fk" FOREIGN KEY ("reporting_manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recharge_requests" ADD CONSTRAINT "recharge_requests_wallet_id_credit_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."credit_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recharge_requests" ADD CONSTRAINT "recharge_requests_subscription_id_platform_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."platform_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recharge_requests" ADD CONSTRAINT "recharge_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recharge_requests" ADD CONSTRAINT "recharge_requests_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recharge_requests" ADD CONSTRAINT "recharge_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_wallet_id_credit_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."credit_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_subscription_id_platform_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."platform_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_provisioning_idempotency_key_unique" UNIQUE("provisioning_idempotency_key");--> statement-breakpoint
ALTER TABLE "firms" ADD CONSTRAINT "firms_provisioning_request_id_unique" UNIQUE("provisioning_request_id");--> statement-breakpoint
ALTER TABLE "firms" ADD CONSTRAINT "firms_control_firm_id_unique" UNIQUE("control_firm_id");--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_user_id_unique" UNIQUE("user_id");--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_access_request_id_unique" UNIQUE("access_request_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_provisioning_request_id_unique" UNIQUE("provisioning_request_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_platform_user_id_unique" UNIQUE("platform_user_id");