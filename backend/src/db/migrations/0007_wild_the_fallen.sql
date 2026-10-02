CREATE TABLE "platform_collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"status" text DEFAULT 'Current' NOT NULL,
	"outstanding_amount" text NOT NULL,
	"due_date" timestamp,
	"age" text DEFAULT '0 days' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"plan" text DEFAULT 'Core' NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"billing_interval" text DEFAULT 'Monthly' NOT NULL,
	"seats_allocated" integer DEFAULT 5 NOT NULL,
	"amount" text DEFAULT '0.00' NOT NULL,
	"next_billing_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_subscriptions_firm_id_unique" UNIQUE("firm_id")
);
--> statement-breakpoint
CREATE TABLE "practice_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"engagement_id" integer,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"amount" text NOT NULL,
	"tax_amount" text DEFAULT '0.00' NOT NULL,
	"total_amount" text NOT NULL,
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"invoice_id" integer NOT NULL,
	"amount" text NOT NULL,
	"payment_date" timestamp DEFAULT now() NOT NULL,
	"method" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_collections" ADD CONSTRAINT "platform_collections_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_invoices" ADD CONSTRAINT "practice_invoices_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_invoices" ADD CONSTRAINT "practice_invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_invoices" ADD CONSTRAINT "practice_invoices_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_payments" ADD CONSTRAINT "practice_payments_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_payments" ADD CONSTRAINT "practice_payments_invoice_id_practice_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."practice_invoices"("id") ON DELETE no action ON UPDATE no action;