import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { db, pool } from "../src/db";
import { users, firms, firmUsers, clients, engagements, workingPapers, documents } from "../src/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import path from "path";
import fs from "fs";

describe("Vault APIs (B07)", () => {
  let firmACookie: string;
  let firmAStaffCookie: string;
  let firmBCookie: string;

  let firmAId: number;
  let firmBId: number;
  let userAId: number;
  let userBId: number;

  let clientId: number;
  let engagementId: number;
  let firmBEngagementId: number;
  let wpId: number;
  let docId: number;

  beforeAll(async () => {
    const pwHash = await bcrypt.hash("password123", 10);

    // Create Firms
    const [fa] = await db.insert(firms).values({ name: "Vault Firm A", subdomain: "vault-firma" }).returning();
    const [fb] = await db.insert(firms).values({ name: "Vault Firm B", subdomain: "vault-firmb" }).returning();
    firmAId = fa.id;
    firmBId = fb.id;

    // Create Users
    const [userA] = await db.insert(users).values({ email: "vault-owner@firma.com", passwordHash: pwHash }).returning();
    const [userAStaff] = await db.insert(users).values({ email: "vault-staff@firma.com", passwordHash: pwHash }).returning();
    const [userB] = await db.insert(users).values({ email: "vault-owner@firmb.com", passwordHash: pwHash }).returning();

    userAId = userA.id;
    userBId = userB.id;

    // Assign Roles
    await db.insert(firmUsers).values([
      { userId: userA.id, firmId: firmAId, role: "FIRM_OWNER" },
      { userId: userAStaff.id, firmId: firmAId, role: "STAFF" },
      { userId: userB.id, firmId: firmBId, role: "FIRM_OWNER" }
    ]);

    // Create a Client & Engagement
    const [c] = await db.insert(clients).values({ firmId: firmAId, name: "Vault Client" }).returning();
    clientId = c.id;
    const [e] = await db.insert(engagements).values({ firmId: firmAId, clientId, name: "Vault Audit" }).returning();
    engagementId = e.id;
    const [clientB] = await db.insert(clients).values({ firmId: firmBId, name: "Vault Client B" }).returning();
    const [engagementB] = await db.insert(engagements).values({ firmId: firmBId, clientId: clientB.id, name: "Vault Audit B" }).returning();
    firmBEngagementId = engagementB.id;

    const login = async (email: string) => {
      const res = await request(app).post("/api/v1/auth/login").send({ email, password: "password123" });
      return res.headers["set-cookie"][0];
    };

    firmACookie = await login("vault-owner@firma.com");
    firmAStaffCookie = await login("vault-staff@firma.com");
    firmBCookie = await login("vault-owner@firmb.com");
  });

  afterAll(async () => {
    await db.delete(documents);
    await db.delete(workingPapers);
    await db.delete(engagements);
    await db.delete(clients);
    await db.delete(firmUsers).where(eq(firmUsers.firmId, firmAId));
    await db.delete(firmUsers).where(eq(firmUsers.firmId, firmBId));
    await db.delete(users).where(eq(users.email, "vault-owner@firma.com"));
    await db.delete(users).where(eq(users.email, "vault-staff@firma.com"));
    await db.delete(users).where(eq(users.email, "vault-owner@firmb.com"));
    await db.delete(firms).where(eq(firms.id, firmAId));
    await db.delete(firms).where(eq(firms.id, firmBId));
    await pool.end();
  });

  // WORKING PAPERS
  it("should create a working paper", async () => {
    const res = await request(app)
      .post("/api/v1/working-papers")
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString())
      .send({ title: "Cash Reconciliation", engagementId, indexCode: "C.1" });

    if (res.status === 403) console.error("CREATE WP 403:", res.body);
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe("Cash Reconciliation");
    wpId = res.body.data.id;
  });

  it("should allow manager to review sign-off", async () => {
    const res = await request(app)
      .patch(`/api/v1/working-papers/${wpId}/review`)
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString())
      .send({ action: "approve" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("signed_off");
    expect(res.body.data.signedOffById).toBe(userAId);
  });

  it("should block cross-firm engagement linking", async () => {
    const res = await request(app)
      .post("/api/v1/working-papers")
      .set("Cookie", firmBCookie)
      .set("X-Firm-Id", firmBId.toString())
      .send({ title: "Sneaky WP", engagementId });

    expect(res.status).toBe(403);
  });


  it("should reject a working paper assignee from another firm", async () => {
    const res = await request(app)
      .post("/api/v1/working-papers")
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString())
      .send({ title: "Invalid Assignee", engagementId, assigneeId: userBId });

    expect(res.status).toBe(403);
  });

  // DOCUMENTS
  it("should successfully upload document and persist metadata", async () => {
    const dummyFilePath = path.join(__dirname, "dummy.txt");
    fs.writeFileSync(dummyFilePath, "test content");

    const res = await request(app)
      .post("/api/v1/documents/upload")
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString())
      .field("workingPaperId", wpId.toString())
      .attach("file", dummyFilePath);

    fs.unlinkSync(dummyFilePath);

    if (res.status !== 201) {
      console.error("UPLOAD FAILED:", res.body);
    }
    expect(res.status).toBe(201);
    expect(res.body.data.originalName).toBe("dummy.txt");
    expect(res.body.data.workingPaperId).toBe(wpId);
    docId = res.body.data.id;
  });

  it("should allow authorized user to access document via stream", async () => {
    const res = await request(app)
      .get(`/api/v1/documents/${docId}/download`)
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString());

    expect(res.status).toBe(200);
    expect(res.text).toBe("test content");
  });

  it("should prevent cross-firm document access", async () => {
    const res = await request(app)
      .get(`/api/v1/documents/${docId}/download`)
      .set("Cookie", firmBCookie)
      .set("X-Firm-Id", firmBId.toString());

    expect(res.status).toBe(404);
  });
  it("should reject a document linked to another firm's engagement", async () => {
    const dummyFilePath = path.join(__dirname, "dummy-foreign.txt");
    fs.writeFileSync(dummyFilePath, "test content");

    const res = await request(app)
      .post("/api/v1/documents/upload")
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString())
      .field("engagementId", firmBEngagementId.toString())
      .attach("file", dummyFilePath);

    fs.unlinkSync(dummyFilePath);
    expect(res.status).toBe(403);
  });

  it("should block staff from archiving and soft-archive for an authorized owner", async () => {
    const staffRes = await request(app)
      .delete(`/api/v1/working-papers/${wpId}`)
      .set("Cookie", firmAStaffCookie)
      .set("X-Firm-Id", firmAId.toString());
    expect(staffRes.status).toBe(403);

    const ownerRes = await request(app)
      .delete(`/api/v1/working-papers/${wpId}`)
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString());
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.data.isArchived).toBe(true);

    const [persisted] = await db.select().from(workingPapers).where(eq(workingPapers.id, wpId));
    expect(persisted).toBeDefined();
    expect(persisted.isArchived).toBe(true);

    const getRes = await request(app)
      .get(`/api/v1/working-papers/${wpId}`)
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString());
    expect(getRes.status).toBe(404);
  });

});
