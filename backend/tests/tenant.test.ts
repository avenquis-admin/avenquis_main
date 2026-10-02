import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { db, pool } from "../src/db";
import { users, firms, firmUsers } from "../src/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import express from "express";
import { resolveFirmContext, requireFirmRole, requireFirmPermission, requirePlatformSuperAdmin } from "../src/middlewares/tenantMiddleware";
import { requireAuth } from "../src/middlewares/authMiddleware";

const testApp = express();
testApp.use(express.json());
testApp.use(require("cookie-parser")());
testApp.use((req, res, next) => {
  // Mock JWT verification by just passing cookies if needed, but since we use app we can just mount testApp on app BEFORE 404?
  // Wait, no. We can just create a testRouter and mount it on the imported app?
  // Let's just create a testRouter and tell the existing app to use it.
  next();
});

const testRouter = express.Router();

testRouter.get("/firm-context", requireAuth, resolveFirmContext, (req, res) => {
  res.json({ success: true, data: { firmId: req.firm?.id, role: req.firmRole } });
});

testRouter.get("/firm-role", requireAuth, resolveFirmContext, requireFirmRole(["FIRM_OWNER"]), (req, res) => {
  res.json({ success: true });
});

testRouter.get("/firm-permission", requireAuth, resolveFirmContext, requireFirmPermission("billing:write"), (req, res) => {
  res.json({ success: true });
});

testRouter.get("/platform-admin", requireAuth, requirePlatformSuperAdmin, (req, res) => {
  res.json({ success: true });
});

import { login } from "../src/routes/auth/auth.controller";
import { errorHandler } from "../src/middlewares/errorHandler";
import cookieParser from "cookie-parser";

const mockApp = express();
mockApp.use(express.json());
mockApp.use(cookieParser());
mockApp.post("/api/v1/auth/login", login);
mockApp.use("/api/v1/test", testRouter);
// Global error handler
mockApp.use(errorHandler);


describe("Multi-Tenant Isolation", () => {
  let user1Cookie: string;
  let user2Cookie: string;
  let adminCookie: string;
  let firm1Id: number;
  let firm2Id: number;

  beforeAll(async () => {
    // We assume seed.ts has been run, or we create them here
    // Let's create specific test users to avoid collision
    const pwHash = await bcrypt.hash("password123", 10);

    const [f1] = await db.insert(firms).values({ name: "Test Firm 1", subdomain: "test1" }).returning();
    const [f2] = await db.insert(firms).values({ name: "Test Firm 2", subdomain: "test2" }).returning();
    firm1Id = f1.id;
    firm2Id = f2.id;

    const [u1] = await db.insert(users).values({ email: "tu1@test.com", passwordHash: pwHash }).returning();
    const [u2] = await db.insert(users).values({ email: "tu2@test.com", passwordHash: pwHash }).returning();
    const [admin] = await db.insert(users).values({ email: "admin@test.com", passwordHash: pwHash, platformRole: "PLATFORM_SUPER_ADMIN" }).returning();

    await db.insert(firmUsers).values([
      { userId: u1.id, firmId: firm1Id, role: "FIRM_OWNER" },
      { userId: u2.id, firmId: firm2Id, role: "STAFF" },
    ]);

    // Login users to get cookies
    const login = async (email: string) => {
      const res = await request(mockApp).post("/api/v1/auth/login").send({ email, password: "password123" });
      return res.headers["set-cookie"][0];
    };

    user1Cookie = await login("tu1@test.com");
    user2Cookie = await login("tu2@test.com");
    adminCookie = await login("admin@test.com");
  });

  afterAll(async () => {
    // Cleanup
    await db.delete(users).where(eq(users.email, "tu1@test.com"));
    await db.delete(users).where(eq(users.email, "tu2@test.com"));
    await db.delete(users).where(eq(users.email, "admin@test.com"));
    await db.delete(firms).where(eq(firms.subdomain, "test1"));
    await db.delete(firms).where(eq(firms.subdomain, "test2"));
    await pool.end();
  });

  it("resolves active firm from X-Firm-Id for valid member", async () => {
    const res = await request(mockApp)
      .get("/api/v1/test/firm-context")
      .set("Cookie", user1Cookie)
      .set("X-Firm-Id", firm1Id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.firmId).toBe(firm1Id);
    expect(res.body.data.role).toBe("FIRM_OWNER");
  });

  it("rejects access to another firm via X-Firm-Id spoofing", async () => {
    // User 1 tries to access Firm 2
    const res = await request(mockApp)
      .get("/api/v1/test/firm-context")
      .set("Cookie", user1Cookie)
      .set("X-Firm-Id", firm2Id.toString());

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("You do not have access to this firm");
  });

  it("blocks normal tenant access while the firm is suspended", async () => {
    await db.update(firms).set({ status: "suspended" }).where(eq(firms.id, firm1Id));

    const res = await request(mockApp)
      .get("/api/v1/test/firm-context")
      .set("Cookie", user1Cookie)
      .set("X-Firm-Id", firm1Id.toString());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FIRM_SUSPENDED");

    await db.update(firms).set({ status: "active" }).where(eq(firms.id, firm1Id));
  });

  it("enforces required role", async () => {
    // User 1 is FIRM_OWNER, should pass
    const res1 = await request(mockApp)
      .get("/api/v1/test/firm-role")
      .set("Cookie", user1Cookie)
      .set("X-Firm-Id", firm1Id.toString());
    expect(res1.status).toBe(200);

    // User 2 is STAFF, should fail
    const res2 = await request(mockApp)
      .get("/api/v1/test/firm-role")
      .set("Cookie", user2Cookie)
      .set("X-Firm-Id", firm2Id.toString());
    expect(res2.status).toBe(403);
    expect(res2.body.error.message).toBe("Insufficient firm role");
  });

  it("enforces required permissions mapped from role", async () => {
    // User 1 (FIRM_OWNER) has billing:write
    const res1 = await request(mockApp)
      .get("/api/v1/test/firm-permission")
      .set("Cookie", user1Cookie)
      .set("X-Firm-Id", firm1Id.toString());
    expect(res1.status).toBe(200);

    // User 2 (STAFF) does not have billing:write
    const res2 = await request(mockApp)
      .get("/api/v1/test/firm-permission")
      .set("Cookie", user2Cookie)
      .set("X-Firm-Id", firm2Id.toString());
    expect(res2.status).toBe(403);
    expect(res2.body.error.message).toContain("Missing required permission");
  });

  it("enforces platform super admin correctly", async () => {
    // Admin should pass
    const res1 = await request(mockApp).get("/api/v1/test/platform-admin").set("Cookie", adminCookie);
    expect(res1.status).toBe(200);

    // User 1 should fail
    const res2 = await request(mockApp).get("/api/v1/test/platform-admin").set("Cookie", user1Cookie);
    expect(res2.status).toBe(403);
  });
});
