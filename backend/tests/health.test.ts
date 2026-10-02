import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app";

describe("Health Check API", () => {
  it("should return 200 and success true for /api/v1/health", async () => {
    const response = await request(app).get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("ok");
  });

  it("should return 404 and standardized error for invalid routes", async () => {
    const response = await request(app).get("/api/v1/unknown-route");
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});
