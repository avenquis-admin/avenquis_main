import { z } from "zod";

export const PLATFORM_CONTRACT_VERSION = "1" as const;

export const tenantRoleSchema = z.enum([
  "FIRM_OWNER", "PARTNER", "MANAGER", "STAFF", "ARTICLED_STUDENT", "CLIENT",
]);

const baseCommandSchema = z.object({
  contractVersion: z.literal(PLATFORM_CONTRACT_VERSION),
  eventId: z.string().uuid(),
  provisioningOperationId: z.string().min(8).max(250),
  correlationId: z.string().min(8).max(200),
  occurredAt: z.string().datetime(),
  firmId: z.string().min(1).max(200),
  idempotencyKey: z.string().min(8).max(250),
});

const subscriptionStatusSchema = z.enum(["active", "trialing", "past_due", "suspended", "canceled"]);

export const provisioningCommandSchema = z.discriminatedUnion("action", [
  baseCommandSchema.extend({
    action: z.literal("firm.provision"),
    payload: z.object({ firmName: z.string().min(1).max(200), subdomain: z.string().min(1).max(100), status: z.enum(["pending", "active", "suspended"]).default("pending") }),
  }),
  baseCommandSchema.extend({ action: z.literal("firm.activate"), payload: z.object({ reason: z.string().max(500).optional() }) }),
  baseCommandSchema.extend({ action: z.literal("firm.suspend"), payload: z.object({ reason: z.string().min(1).max(500) }) }),
  baseCommandSchema.extend({
    action: z.literal("user.provision"),
    payload: z.object({ platformUserId: z.string().min(1).max(200), email: z.string().email(), fullName: z.string().min(1).max(200), role: tenantRoleSchema, status: z.enum(["active", "disabled"]).default("active") }),
  }),
  baseCommandSchema.extend({ action: z.literal("user.disable"), payload: z.object({ platformUserId: z.string().min(1).max(200), reason: z.string().min(1).max(500) }) }),
  baseCommandSchema.extend({
    action: z.literal("entitlements.replace"),
    payload: z.object({ subscriptionId: z.string().min(1).max(200), planCode: z.string().min(1).max(100), subscriptionStatus: subscriptionStatusSchema, entitlementVersion: z.number().int().positive(), effectiveFrom: z.string().datetime(), effectiveUntil: z.string().datetime().nullable().default(null), modules: z.record(z.string(), z.boolean()), limits: z.record(z.string(), z.number().int().nonnegative()).default({}) }),
  }),
  baseCommandSchema.extend({
    action: z.literal("subscription.status_changed"),
    payload: z.object({ subscriptionId: z.string().min(1).max(200), subscriptionStatus: subscriptionStatusSchema, entitlementVersion: z.number().int().positive() }),
  }),
]);

export const provisioningResultSchema = z.object({
  contractVersion: z.literal(PLATFORM_CONTRACT_VERSION),
  provisioningOperationId: z.string().min(1),
  correlationId: z.string().min(8),
  firmId: z.string().min(1),
  coreFirmId: z.number().int().positive().optional(),
  platformUserId: z.string().min(1).optional(),
  coreUserId: z.number().int().positive().optional(),
  subscriptionId: z.string().min(1).optional(),
  entitlementVersion: z.number().int().positive().optional(),
  status: z.literal("COMPLETED"),
  processedAt: z.string().datetime(),
}).passthrough();

export type ProvisioningCommand = z.infer<typeof provisioningCommandSchema>;
