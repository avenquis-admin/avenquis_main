ALTER TABLE "audit_events" ADD COLUMN "actor_user_id" text;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "actor_role_context" text;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "target_tenant_id" text;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "target_user_id" text;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "target_resource_type" text;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "target_resource_id" text;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "previous_state" text;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "new_state" text;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "correlation_id" text;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "reason" text;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "source_application" text DEFAULT 'legacy' NOT NULL;
--> statement-breakpoint
CREATE INDEX "audit_events_action_timestamp_idx" ON "audit_events" ("action", "timestamp");
--> statement-breakpoint
CREATE INDEX "audit_events_correlation_id_idx" ON "audit_events" ("correlation_id");
--> statement-breakpoint
CREATE INDEX "audit_events_target_tenant_idx" ON "audit_events" ("target_tenant_id", "timestamp");
