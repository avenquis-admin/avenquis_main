import { describe, expect, it } from "vitest";
import { provisioningCommandSchema, provisioningResultSchema } from "../src/contracts/platform";

const base = {
  contractVersion: "1",
  eventId: "0d4478f1-2999-4e1b-8f7f-90b703d5fc36",
  provisioningOperationId: "prov-task10-operation",
  correlationId: "task10-correlation",
  occurredAt: "2026-10-02T00:00:00.000Z",
  firmId: "firm-fames-r",
  idempotencyKey: "task10-idempotency-key",
};

describe("Control to Core platform contract", () => {
  it.each([
    ["firm.provision", { firmName: "FAMES & R", subdomain: "fames-r", status: "pending" }],
    ["firm.activate", { reason: "Provisioning completed" }],
    ["firm.suspend", { reason: "Subscription suspended" }],
    ["user.provision", { platformUserId: "platform-user-1", email: "tenant@example.test", fullName: "Tenant Admin", role: "FIRM_OWNER", status: "active" }],
    ["user.disable", { platformUserId: "platform-user-1", reason: "Access removed" }],
    ["entitlements.replace", { subscriptionId: "subscription-1", planCode: "professional", subscriptionStatus: "active", entitlementVersion: 2, effectiveFrom: "2026-10-02T00:00:00.000Z", effectiveUntil: null, modules: { dashboard: true }, limits: {} }],
    ["subscription.status_changed", { subscriptionId: "subscription-1", subscriptionStatus: "suspended", entitlementVersion: 3 }],
  ])("accepts %s", (action, payload) => {
    expect(provisioningCommandSchema.safeParse({ ...base, action, payload }).success).toBe(true);
  });

  it("never accepts a tenant as a Control platform super admin", () => {
    const result = provisioningCommandSchema.safeParse({
      ...base,
      action: "user.provision",
      payload: { platformUserId: "platform-fames-r", email: "fames@example.test", fullName: "FAMES & R", role: "PLATFORM_SUPER_ADMIN", status: "active" },
    });
    expect(result.success).toBe(false);
  });

  it("preserves every cross-platform identifier in the result contract", () => {
    expect(provisioningResultSchema.safeParse({
      contractVersion: "1", provisioningOperationId: "prov-task10-operation",
      correlationId: "task10-correlation", firmId: "firm-fames-r", coreFirmId: 10,
      platformUserId: "platform-user-1", coreUserId: 20, subscriptionId: "subscription-1",
      entitlementVersion: 3, status: "COMPLETED", processedAt: "2026-10-02T00:00:00.000Z",
    }).success).toBe(true);
  });
});
