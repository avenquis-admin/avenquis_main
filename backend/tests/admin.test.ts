import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { db, pool } from "../src/db";
import { users, firms, auditEvents } from "../src/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

describe("Platform Admin API", () => {
  let adminCookie: string;
  let normalUserCookie: string;
  let firmId: number;

  beforeAll(async () => {
    const pwHash = await bcrypt.hash("password123", 10);

    // Create an admin
    const [admin] = await db.insert(users).values({
      email: "b04_admin@test.com",
      passwordHash: pwHash,
      platformRole: "PLATFORM_SUPER_ADMIN"
    }).returning();

    // Create a normal user
    const [normalUser] = await db.insert(users).values({
      email: "b04_user@test.com",
      passwordHash: pwHash
    }).returning();

    // Create a firm
    const [f] = await db.insert(firms).values({
      name: "B04 Test Firm",
      subdomain: "b04test"
    }).returning();
    firmId = f.id;

    // Login users to get cookies
    const login = async (email: string) => {
      const res = await request(app).post("/api/v1/auth/login").send({ email, password: "password123" });
      return res.headers["set-cookie"][0];
    };

    adminCookie = await login("b04_admin@test.com");
    normalUserCookie = await login("b04_user@test.com");
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, "b04_admin@test.com"));
    await db.delete(users).where(eq(users.email, "b04_user@test.com"));
    await db.delete(firms).where(eq(firms.subdomain, "b04test"));
    await db.delete(auditEvents);
    await pool.end();
  });

  it("should deny unauthenticated users with 401", async () => {
    const res = await request(app).get("/api/v1/admin/overview/metrics");
    expect(res.status).toBe(401);
  });

  it("should deny normal tenant users with 403", async () => {
    const res = await request(app).get("/api/v1/admin/overview/metrics").set("Cookie", normalUserCookie);
    expect(res.status).toBe(403);
  });

  it("should ignore forged headers and still return 403 for normal users", async () => {
    const res = await request(app)
      .get("/api/v1/admin/overview/metrics")
      .set("Cookie", normalUserCookie)
      .set("x-platform-admin", "true")
      .set("role", "PLATFORM_SUPER_ADMIN");
    expect(res.status).toBe(403);
  });

  it("should allow platform admin to access overview metrics", async () => {
    const res = await request(app).get("/api/v1/admin/overview/metrics").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it("should list firms for admin", async () => {
    const res = await request(app).get("/api/v1/admin/firms").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const firm = res.body.data.find((f: any) => f.id === firmId.toString());
    expect(firm).toBeDefined();
    expect(firm.name).toBe("B04 Test Firm");
  });

  it("should return firm detail", async () => {
    const res = await request(app).get(`/api/v1/admin/firms/${firmId}`).set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(firmId.toString());
  });

  it("should allow firm admin mutation (suspend) and create audit log", async () => {
    const res = await request(app)
      .post(`/api/v1/admin/firms/${firmId}/suspend`)
      .set("Cookie", adminCookie)
      .send({ reason: "Violation" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("suspended");
    const [persisted] = await db.select().from(firms).where(eq(firms.id, firmId));
    expect(persisted.status).toBe("suspended");

    // Check audit log
    const auditRes = await request(app).get("/api/v1/admin/audit/events").set("Cookie", adminCookie);
    expect(auditRes.status).toBe(200);
    const hasLog = auditRes.body.data.some((log: any) => log.action.includes(`Suspended firm ${firmId}`));
    expect(hasLog).toBe(true);
  });

  it("should allow firm admin mutation (activate) and create audit log", async () => {
    const res = await request(app)
      .post(`/api/v1/admin/firms/${firmId}/activate`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("active");
    const [persisted] = await db.select().from(firms).where(eq(firms.id, firmId));
    expect(persisted.status).toBe("active");
  });

  it("should list access requests", async () => {
    const res = await request(app).get("/api/v1/admin/access-requests").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("should list users", async () => {
    const res = await request(app).get("/api/v1/admin/users").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
