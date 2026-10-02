CREATE TYPE "public"."access_request_status" AS ENUM('pending', 'reviewing', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "access_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_name" text NOT NULL,
	"requester_name" text NOT NULL,
	"requester_email" text NOT NULL,
	"request_type" text NOT NULL,
	"status" "access_request_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"severity" text NOT NULL,
	"details" text NOT NULL
);
