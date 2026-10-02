import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { app } from "../src/app";
import { db } from "../src/db";
import { accessRequests, auditEvents } from "../src/db/schema";

const emails = ["individual-c3@example.com", "firm-c3@example.com", "duplicate-c3@example.com", "control-visible@example.com"];

describe("Public API (Access Requests)", () => {
  beforeEach(async () => {
    for (const email of emails) {
      await db.delete(accessRequests).where(eq(accessRequests.requesterEmail, email));
      await db.delete(auditEvents).where(eq(auditEvents.actor, `public:${email}`));
    }
  });

  afterAll(async () => {
    for (const email of emails) {
      await db.delete(accessRequests).where(eq(accessRequests.requesterEmail, email));
      await db.delete(auditEvents).where(eq(auditEvents.actor, `public:${email}`));
    }
  });

  it("creates an authoritative individual request with pending status and audit metadata", async () => {
    const res = await request(app).post("/api/v1/public/access-requests").send({
      requestType: "individual",
      requesterName: "Individual User",
      requesterEmail: "Individual-C3@Example.com",
      mobile: "+8801700000001",
      professionalRole: "Manager",
      professionalRegistration: "ICAB-123",
      reasonUseCase: "Evaluate the Core App for professional work.",
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("pending");
    expect(res.body.data.id).toEqual(expect.any(Number));
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(res.body.token).toBeUndefined();

    const [row] = await db.select().from(accessRequests).where(eq(accessRequests.requesterEmail, "individual-c3@example.com"));
    expect(row.requestType).toBe("individual");
    expect(row.requesterName).toBe("Individual User");
    expect(row.mobile).toBe("+8801700000001");
    expect(row.professionalRole).toBe("Manager");
    expect(row.firmName).toBeNull();
    expect(row.status).toBe("pending");
    expect(JSON.parse(row.auditMetadata).source).toBe("public_web");

    const events = await db.select().from(auditEvents).where(eq(auditEvents.actor, "public:individual-c3@example.com"));
    expect(events).toHaveLength(1);
  });

  it("creates an authoritative firm request with all required firm fields", async () => {
    const res = await request(app).post("/api/v1/public/access-requests").send({
      requestType: "firm",
      requesterName: "Partner User",
      requesterEmail: "firm-c3@example.com",
      mobile: "+8801700000002",
      firmName: "C3 Test & Co.",
      partnerName: "Partner User",
      practiceType: "Partnership",
      firmSize: "11-25",
      professionalRegistration: "FCA-456",
      reasonUseCase: "Onboard the audit practice team.",
    });

    expect(res.status).toBe(201);
    const [row] = await db.select().from(accessRequests).where(eq(accessRequests.requesterEmail, "firm-c3@example.com"));
    expect(row.requestType).toBe("firm");
    expect(row.firmName).toBe("C3 Test & Co.");
    expect(row.partnerName).toBe("Partner User");
    expect(row.practiceType).toBe("Partnership");
    expect(row.firmSize).toBe("11-25");
    expect(row.status).toBe("pending");
  });

  it("rejects invalid request-type-specific payloads without creating a request", async () => {
    const res = await request(app).post("/api/v1/public/access-requests").send({
      requestType: "individual",
      requesterName: "Invalid User",
      requesterEmail: "not-an-email",
      mobile: "1",
      reasonUseCase: "x",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a duplicate pending request cleanly", async () => {
    const payload = {
      requestType: "individual",
      requesterName: "Duplicate User",
      requesterEmail: "duplicate-c3@example.com",
      mobile: "+8801700000003",
      professionalRole: "Staff",
      reasonUseCase: "Request access for daily audit work.",
    };

    const first = await request(app).post("/api/v1/public/access-requests").send(payload);
    const second = await request(app).post("/api/v1/public/access-requests").send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("ACCESS_REQUEST_EXISTS");

    const rows = await db.select().from(accessRequests).where(eq(accessRequests.requesterEmail, "duplicate-c3@example.com"));
    expect(rows).toHaveLength(1);
  });

  it("makes a Core submission immediately visible and reviewable through the Control contract", async () => {
    const token = process.env.CONTROL_SERVICE_TOKEN;
    expect(token).toBeTruthy();
    const created = await request(app).post("/api/v1/public/access-requests").send({
      requestType: "individual",
      requesterName: "Control Visible User",
      requesterEmail: "control-visible@example.com",
      mobile: "+8801700000004",
      professionalRole: "Staff",
      reasonUseCase: "Verify the shared Core-Control review queue.",
    });
    expect(created.status).toBe(201);

    const queue = await request(app)
      .get("/api/v1/control/access-requests?search=control-visible@example.com")
      .set("Authorization", `Bearer ${token}`);
    expect(queue.status).toBe(200);
    expect(queue.body.data).toHaveLength(1);
    expect(queue.body.data[0].id).toBe(String(created.body.data.id));

    const reviewed = await request(app)
      .post(`/api/v1/control/access-requests/${created.body.data.id}/review`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        decision: "rejected",
        actor: "Platform Admin",
        actorId: "platform-admin-test",
        actorPlatformRole: "PLATFORM_ADMIN",
        reason: "Contract integration verification",
        correlationId: "core-control-visibility-test",
      });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.data.status).toBe("rejected");

    const [row] = await db.select().from(accessRequests).where(eq(accessRequests.id, created.body.data.id));
    expect(row.status).toBe("rejected");
    expect(row.reviewerId).toBe("platform-admin-test");
  });
});
