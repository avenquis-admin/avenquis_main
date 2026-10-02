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
  "completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "chatbot_knowledge_items" ADD CONSTRAINT "chatbot_knowledge_items_tenant_id_firms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chatbot_knowledge_items" ADD CONSTRAINT "chatbot_knowledge_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chatbot_knowledge_items" ADD CONSTRAINT "chatbot_knowledge_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chatbot_knowledge_items" ADD CONSTRAINT "chatbot_knowledge_items_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chatbot_usage_records" ADD CONSTRAINT "chatbot_usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chatbot_usage_records" ADD CONSTRAINT "chatbot_usage_records_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chatbot_usage_records" ADD CONSTRAINT "chatbot_usage_records_wallet_id_credit_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."credit_wallets"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chatbot_usage_records" ADD CONSTRAINT "chatbot_usage_records_usage_event_id_usage_events_id_fk" FOREIGN KEY ("usage_event_id") REFERENCES "public"."usage_events"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chatbot_usage_records" ADD CONSTRAINT "chatbot_usage_records_knowledge_item_id_chatbot_knowledge_items_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."chatbot_knowledge_items"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chatbot_usage_records" ADD CONSTRAINT "chatbot_usage_records_idempotency_key_unique" UNIQUE("idempotency_key");
--> statement-breakpoint
CREATE INDEX "chatbot_knowledge_active_scope_idx" ON "chatbot_knowledge_items" ("review_status", "tenant_id", "client_id", "engagement_id");
--> statement-breakpoint
CREATE INDEX "chatbot_knowledge_question_idx" ON "chatbot_knowledge_items" ("normalized_question");
--> statement-breakpoint
CREATE INDEX "chatbot_usage_firm_created_idx" ON "chatbot_usage_records" ("firm_id", "created_at");
