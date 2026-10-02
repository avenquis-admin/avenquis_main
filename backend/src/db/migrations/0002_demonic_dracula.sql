CREATE TYPE "public"."firm_role" AS ENUM('FIRM_OWNER', 'PARTNER', 'MANAGER', 'STAFF', 'ARTICLED_STUDENT', 'CLIENT');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('PLATFORM_SUPER_ADMIN', 'PLATFORM_OPERATOR', 'PLATFORM_AUDITOR');--> statement-breakpoint
CREATE TABLE "firm_users" (
	"user_id" integer NOT NULL,
	"firm_id" integer NOT NULL,
	"role" "firm_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "firm_users_user_id_firm_id_pk" PRIMARY KEY("user_id","firm_id")
);
--> statement-breakpoint
CREATE TABLE "firms" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subdomain" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "firms_subdomain_unique" UNIQUE("subdomain")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform_role" "platform_role";--> statement-breakpoint
ALTER TABLE "firm_users" ADD CONSTRAINT "firm_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_users" ADD CONSTRAINT "firm_users_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;