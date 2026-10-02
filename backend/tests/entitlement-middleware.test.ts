import { afterEach, describe, expect, it, vi } from "vitest";
import { pool } from "../src/db";
import { requireEntitlement } from "../src/middlewares/tenantMiddleware";
import { ApiError } from "../src/middlewares/errorHandler";

function runEntitlement(row: Record<string, unknown> | undefined) {
  vi.spyOn(pool, "query").mockResolvedValue({ rows: row ? [row] : [] } as never);
  const middleware = requireEntitlement("clients");
  return new Promise<unknown>((resolve) => {
    middleware({ firm: { id: 42 } } as never, {} as never, (error?: unknown) => resolve(error));
  });
}

describe("tenant entitlement enforcement", () => {
  afterEach(() => vi.restoreAllMocks());

  it("allows an enabled module for an active subscription in its effective period", async () => {
    const error = await runEntitlement({
      entitlementStatus: "active", subscriptionStatus: "active", enabled: true,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), effectiveUntil: null,
    });
    expect(error).toBeUndefined();
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("WHERE e.firm_id = $1"), [42, "clients"]);
  });

  it("rejects a suspended subscription", async () => {
    const error = await runEntitlement({
      entitlementStatus: "suspended", subscriptionStatus: "suspended", enabled: true,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), effectiveUntil: null,
    });
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("SUBSCRIPTION_INACTIVE");
  });

  it("rejects a disabled module", async () => {
    const error = await runEntitlement({
      entitlementStatus: "active", subscriptionStatus: "active", enabled: false,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), effectiveUntil: null,
    });
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("MODULE_NOT_ENTITLED");
  });
});
