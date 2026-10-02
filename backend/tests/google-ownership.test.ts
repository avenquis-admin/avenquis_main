import { describe, expect, it } from "vitest";
import { ApiError } from "../src/middlewares/errorHandler";
import { assertFirmGoogleOwnership } from "../src/integrations/google/firmGoogle";

describe("firm Google ownership", () => {
  it("allows the owning firm", () => {
    expect(() => assertFirmGoogleOwnership(101, { firmId: 101 })).not.toThrow();
  });

  it("blocks another tenant from using the connection", () => {
    try {
      assertFirmGoogleOwnership(202, { firmId: 101 });
      throw new Error("Expected tenant mismatch");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("GOOGLE_CONNECTION_TENANT_MISMATCH");
    }
  });
});
