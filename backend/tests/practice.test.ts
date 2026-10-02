import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { db, pool } from "../src/db";
import { users, firms, firmUsers, clients, engagements, workingPapers, documents, practiceInvoices } from "../src/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

describe("Practice APIs (B05)", () => {
  let firmACookie: string;
  let firmAStaffCookie: string;
  let firmBCookie: string;

  let firmAId: number;
  let firmBId: number;
  let firmAClientId: number;

  beforeAll(async () => {
    const pwHash = await bcrypt.hash("password123", 10);

    // Create Firms
    const [fa] = await db.insert(firms).values({ name: "Prac Firm A", subdomain: `prac-firma-${Date.now()}` }).returning();
    const [fb] = await db.insert(firms).values({ name: "Prac Firm B", subdomain: `prac-firmb-${Date.now()}` }).returning();
    firmAId = fa.id;
    firmBId = fb.id;

    // Create Users
    const [userA] = await db.insert(users).values({ email: "prac-owner@firma.com", passwordHash: pwHash }).returning();
    const [userAStaff] = await db.insert(users).values({ email: "prac-staff@firma.com", passwordHash: pwHash }).returning();
    const [userB] = await db.insert(users).values({ email: "prac-owner@firmb.com", passwordHash: pwHash }).returning();

    // Assign Roles
    await db.insert(firmUsers).values([
      { userId: userA.id, firmId: firmAId, role: "FIRM_OWNER" },
      { userId: userAStaff.id, firmId: firmAId, role: "STAFF" },
      { userId: userB.id, firmId: firmBId, role: "FIRM_OWNER" }
    ]);

    // Login users
    const login = async (email: string) => {
      const res = await request(app).post("/api/v1/auth/login").send({ email, password: "password123" });
      return res.headers["set-cookie"][0];
    };

    firmACookie = await login("prac-owner@firma.com");
    firmAStaffCookie = await login("prac-staff@firma.com");
    firmBCookie = await login("prac-owner@firmb.com");
  });

  afterAll(async () => {
    // Delete dependents first
    await db.delete(practiceInvoices);
    await db.delete(documents);
    await db.delete(workingPapers);
    await db.delete(engagements);
    await db.delete(clients);
    await db.delete(firmUsers).where(eq(firmUsers.firmId, firmAId));
    await db.delete(firmUsers).where(eq(firmUsers.firmId, firmBId));
    await db.delete(users).where(eq(users.email, "prac-owner@firma.com"));
    await db.delete(users).where(eq(users.email, "prac-staff@firma.com"));
    await db.delete(users).where(eq(users.email, "prac-owner@firmb.com"));
    await db.delete(firms).where(eq(firms.id, firmAId));
    await db.delete(firms).where(eq(firms.id, firmBId));
    await pool.end();
  });

  it("should block unauthenticated access", async () => {
    const res = await request(app).get("/api/v1/clients").set("X-Firm-Id", firmAId.toString());
    expect(res.status).toBe(401);
  });

  it("should return validation error for missing client name", async () => {
    const res = await request(app)
      .post("/api/v1/clients")
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString())
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should create a client for Firm A", async () => {
    const res = await request(app)
      .post("/api/v1/clients")
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString())
      .send({ name: "Acme Corp" });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("Acme Corp");
    firmAClientId = res.body.data.id;
  });

  it("should list clients for Firm A", async () => {
    const res = await request(app)
      .get("/api/v1/clients")
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString());
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe(firmAClientId);
  });

  it("should allow updating client", async () => {
    const res = await request(app)
      .patch(`/api/v1/clients/${firmAClientId}`)
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString())
      .send({ name: "Acme Global" });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Acme Global");
  });

  it("should isolate tenants: Firm B cannot access Firm A client", async () => {
    const res = await request(app)
      .get(`/api/v1/clients/${firmAClientId}`)
      .set("Cookie", firmBCookie)
      .set("X-Firm-Id", firmBId.toString());
    expect(res.status).toBe(404); // Not found because WHERE firm_id = firmBId returns nothing
  });

  it("should enforce RBAC: Staff cannot create client", async () => {
    // Assuming staff doesn't have clients:write. Wait, let me just assert the status code.
    const res = await request(app)
      .post("/api/v1/clients")
      .set("Cookie", firmAStaffCookie)
      .set("X-Firm-Id", firmAId.toString())
      .send({ name: "Staff Corp" });

    // Depending on what permissions STAFF has in rbac.ts, this could be 403.
    // If it's 403, we pass. If it's 201, then STAFF has clients:write.
    // Let's check our rbac.ts. In B03, STAFF has: dashboard:read, clients:read, engagements:read, tasks:read, tasks:write, working_papers:read, working_papers:write.
    // So STAFF does NOT have clients:write! It should be 403.
    expect(res.status).toBe(403);
  });

  it("should allow Firm A to create an engagement for its client", async () => {
    const res = await request(app)
      .post("/api/v1/engagements")
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString())
      .send({ clientId: firmAClientId, name: "2026 Audit" });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("2026 Audit");
  });

  it("should prevent Firm B from attaching an engagement to Firm A's client", async () => {
    const res = await request(app)
      .post("/api/v1/engagements")
      .set("Cookie", firmBCookie)
      .set("X-Firm-Id", firmBId.toString())
      .send({ clientId: firmAClientId, name: "Sneaky Audit" });
    expect(res.status).toBe(403); // Forbidden
    expect(res.body.error.message).toContain("Client does not exist or belong to this firm");
  });
});
