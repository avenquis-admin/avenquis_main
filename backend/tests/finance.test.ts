import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { db, pool } from "../src/db";
import { users, firms, firmUsers, clients, engagements, practiceInvoices, platformSubscriptions } from "../src/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

describe("Financial APIs (B08)", () => {
  let firmACookie: string;
  let firmBCookie: string;
  let adminCookie: string;

  let firmAId: number;
  let firmBId: number;

  let clientId: number;
  let invoiceId: number;

  beforeAll(async () => {
    const pwHash = await bcrypt.hash("password123", 10);

    // Create Firms
    const [fa] = await db.insert(firms).values({ name: "Fin Firm A", subdomain: "fin-firma" }).returning();
    const [fb] = await db.insert(firms).values({ name: "Fin Firm B", subdomain: "fin-firmb" }).returning();
    firmAId = fa.id;
    firmBId = fb.id;

    // Create Subscriptions
    await db.insert(platformSubscriptions).values([
      { firmId: firmAId, plan: "Pro", amount: "99.00" },
      { firmId: firmBId, plan: "Enterprise", amount: "499.00" }
    ]);

    // Create Users
    const [userA] = await db.insert(users).values({ email: "fin-owner@firma.com", passwordHash: pwHash }).returning();
    const [userB] = await db.insert(users).values({ email: "fin-owner@firmb.com", passwordHash: pwHash }).returning();
    const [admin] = await db.insert(users).values({ email: "fin-admin@avenquis.com", passwordHash: pwHash, platformRole: "PLATFORM_SUPER_ADMIN" }).returning();

    // Assign Roles
    await db.insert(firmUsers).values([
      { userId: userA.id, firmId: firmAId, role: "FIRM_OWNER" },
      { userId: userB.id, firmId: firmBId, role: "FIRM_OWNER" }
    ]);

    // Create Client
    const [c] = await db.insert(clients).values({ firmId: firmAId, name: "Fin Client" }).returning();
    clientId = c.id;

    const login = async (email: string) => {
      const res = await request(app).post("/api/v1/auth/login").send({ email, password: "password123" });
      return res.headers["set-cookie"][0];
    };

    firmACookie = await login("fin-owner@firma.com");
    firmBCookie = await login("fin-owner@firmb.com");
    adminCookie = await login("fin-admin@avenquis.com");
  });

  afterAll(async () => {
    await db.delete(practiceInvoices);
    await db.delete(clients).where(eq(clients.id, clientId));
    await db.delete(platformSubscriptions).where(eq(platformSubscriptions.firmId, firmAId));
    await db.delete(platformSubscriptions).where(eq(platformSubscriptions.firmId, firmBId));
    await db.delete(firmUsers).where(eq(firmUsers.firmId, firmAId));
    await db.delete(firmUsers).where(eq(firmUsers.firmId, firmBId));
    await db.delete(users).where(eq(users.email, "fin-owner@firma.com"));
    await db.delete(users).where(eq(users.email, "fin-owner@firmb.com"));
    await db.delete(users).where(eq(users.email, "fin-admin@avenquis.com"));
    await db.delete(firms).where(eq(firms.id, firmAId));
    await db.delete(firms).where(eq(firms.id, firmBId));
    await pool.end();
  });

  // PRACTICE INVOICING
  it("should block invoice creation with invalid math", async () => {
    const res = await request(app)
      .post("/api/v1/invoices")
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString())
      .send({ clientId, amount: "100.00", taxAmount: "10.00", totalAmount: "111.00" });

    expect(res.status).toBe(400); // 100+10 = 110, not 111
  });

  it("should create a valid invoice", async () => {
    const res = await request(app)
      .post("/api/v1/invoices")
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString())
      .send({ clientId, amount: "100.00", taxAmount: "10.00", totalAmount: "110.00" });

    expect(res.status).toBe(201);
    expect(res.body.data.totalAmount).toBe("110.00");
    invoiceId = res.body.data.id;
  });

  it("should issue an invoice", async () => {
    const res = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/issue`)
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ISSUED");
  });

  it("should block cross-firm invoice access", async () => {
    const res = await request(app)
      .get(`/api/v1/invoices/${invoiceId}`)
      .set("Cookie", firmBCookie)
      .set("X-Firm-Id", firmBId.toString());

    expect(res.status).toBe(404);
  });

  // PLATFORM BILLING
  it("should allow platform admin to list subscriptions", async () => {
    const res = await request(app)
      .get("/api/v1/admin/billing/subscriptions")
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty("plan");
  });

  it("should block normal firm user from admin billing APIs", async () => {
    const res = await request(app)
      .get("/api/v1/admin/billing/subscriptions")
      .set("Cookie", firmACookie);

    expect(res.status).toBe(403);
  });
});
