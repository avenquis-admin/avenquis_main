import bcrypt from "bcrypt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import { app } from "../src/app";
import { db } from "../src/db";
import { auditEvents, firmUsers, firms, users } from "../src/db/schema";

const token = process.env.CONTROL_SERVICE_TOKEN!;
const password = "SecurePassword123!";
let governedFirmId: number;
let otherFirmId: number;
let governedUserId: number;
let outsiderUserId: number;
let governedCookie: string;
let outsiderCookie: string;

const actor = { actor: "X5 Control Admin", actorId: "x5-admin", actorPlatformRole: "PLATFORM_ADMIN", reason: "X5 governance verification", correlationId: "x5-governance-correlation" };
const controlPost = (path: string, body = actor) => request(app).post(`/api/v1/control${path}`).set("Authorization", `Bearer ${token}`).send(body);

beforeAll(async () => {
  const suffix = Date.now();
  [governedFirmId, otherFirmId] = (await db.insert(firms).values([
    { name: `X5 Governed ${suffix}`, subdomain: `x5-governed-${suffix}`, status: "pending_activation" },
    { name: `X5 Other ${suffix}`, subdomain: `x5-other-${suffix}`, status: "active" },
  ]).returning()).map((firm) => firm.id);
  const passwordHash = await bcrypt.hash(password, 12);
  [governedUserId, outsiderUserId] = (await db.insert(users).values([
    { email: `x5-governed-${suffix}@example.test`, passwordHash, fullName: "X5 Governed User", status: "active", accountRole: "FIRM_OWNER" },
    { email: `x5-outsider-${suffix}@example.test`, passwordHash, fullName: "X5 Outsider", status: "active", accountRole: "FIRM_OWNER" },
  ]).returning()).map((user) => user.id);
  await db.insert(firmUsers).values([
    { userId: governedUserId, firmId: governedFirmId, role: "FIRM_OWNER" },
    { userId: outsiderUserId, firmId: otherFirmId, role: "FIRM_OWNER" },
  ]);
  const governedLogin = await request(app).post("/api/v1/auth/login").send({ email: `x5-governed-${suffix}@example.test`, password });
  const outsiderLogin = await request(app).post("/api/v1/auth/login").send({ email: `x5-outsider-${suffix}@example.test`, password });
  governedCookie = governedLogin.headers["set-cookie"][0].split(";")[0];
  outsiderCookie = outsiderLogin.headers["set-cookie"][0].split(";")[0];
});

afterAll(async () => {
  await db.delete(firmUsers).where(inArray(firmUsers.userId, [governedUserId, outsiderUserId]));
  await db.delete(users).where(inArray(users.id, [governedUserId, outsiderUserId]));
  await db.delete(firms).where(inArray(firms.id, [governedFirmId, otherFirmId]));
  await db.delete(auditEvents).where(eq(auditEvents.actor, actor.actor));
});

describe("Phase X5 authoritative firm and user governance", () => {
  it("rejects governance mutations from a non-admin platform role", async () => {
    const denied = await controlPost(`/governance/firms/${governedFirmId}/activate`, {
      ...actor,
      actor: "X5 Control Maintainer",
      actorId: "x5-maintainer",
      actorPlatformRole: "PLATFORM_MAINTAINER",
      reason: "Maintainer must remain read-only",
    });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("GOVERNANCE_WRITE_FORBIDDEN");
  });

  it("activates, suspends, and reactivates a firm while existing sessions obey current state", async () => {
    expect((await controlPost(`/governance/firms/${governedFirmId}/activate`)).status).toBe(200);
    expect((await request(app).get("/api/v1/clients").set("Cookie", governedCookie).set("X-Firm-Id", String(governedFirmId))).status).toBe(200);
    const suspended = await controlPost(`/governance/firms/${governedFirmId}/suspend`, { ...actor, reason: "Compliance suspension under X5" });
    expect(suspended.status).toBe(200); expect(suspended.body.data.status).toBe("suspended");
    const blocked = await request(app).get("/api/v1/clients").set("Cookie", governedCookie).set("X-Firm-Id", String(governedFirmId));
    expect(blocked.status).toBe(403); expect(blocked.body.error.code).toBe("FIRM_SUSPENDED");
    const restored = await controlPost(`/governance/firms/${governedFirmId}/reactivate`, { ...actor, reason: "Compliance suspension cleared" });
    expect(restored.status).toBe(200); expect(restored.body.data.status).toBe("active");
    expect((await request(app).get("/api/v1/clients").set("Cookie", governedCookie).set("X-Firm-Id", String(governedFirmId))).status).toBe(200);
  });

  it("disables an existing user session and restores access only after enablement", async () => {
    const disabled = await controlPost(`/governance/users/${governedUserId}/disable`, { ...actor, reason: "Account disabled for access review" });
    expect(disabled.status).toBe(200); expect(disabled.body.data.status).toBe("disabled");
    const blocked = await request(app).get("/api/v1/profile").set("Cookie", governedCookie);
    expect(blocked.status).toBe(403); expect(blocked.body.error.code).toBe("ACCOUNT_DISABLED");
    const enabled = await controlPost(`/governance/users/${governedUserId}/enable`, { ...actor, reason: "Access review completed" });
    expect(enabled.status).toBe(200); expect(enabled.body.data.status).toBe("active");
    expect((await request(app).get("/api/v1/profile").set("Cookie", governedCookie)).status).toBe(200);
  });

  it("revokes only the selected membership and preserves tenant boundaries", async () => {
    const outsider = await request(app).get("/api/v1/clients").set("Cookie", outsiderCookie).set("X-Firm-Id", String(governedFirmId));
    expect(outsider.status).toBe(403);
    const revoked = await controlPost(`/governance/users/${governedUserId}/revoke-access`, { ...actor, firmId: governedFirmId, reason: "Firm membership expressly revoked" } as any);
    expect(revoked.status).toBe(200); expect(revoked.body.data.status).toBe("revoked");
    const blocked = await request(app).get("/api/v1/clients").set("Cookie", governedCookie).set("X-Firm-Id", String(governedFirmId));
    expect(blocked.status).toBe(403); expect(blocked.body.error.code).toBe("MEMBERSHIP_REVOKED");
    expect((await request(app).get("/api/v1/clients").set("Cookie", outsiderCookie).set("X-Firm-Id", String(otherFirmId))).status).toBe(200);
  });

  it("persists auditable previous/new states with actor, tenant, correlation, and reason", async () => {
    const events = await db.select().from(auditEvents).where(eq(auditEvents.actor, actor.actor));
    const actions = events.map((event) => event.action);
    expect(actions).toEqual(expect.arrayContaining(["FIRM_ACTIVATED", "FIRM_SUSPENDED", "FIRM_REACTIVATED", "USER_DISABLED", "USER_ENABLED", "FIRM_ACCESS_REVOKED"]));
    const revoke = events.find((event) => event.action === "FIRM_ACCESS_REVOKED")!;
    expect(revoke.details).toContain(`\"targetFirmId\":\"${governedFirmId}\"`);
    expect(revoke.details).toContain("Firm membership expressly revoked");
    expect(revoke.details).toContain("x5-admin");
    expect(revoke.details).toContain("x5-governance-correlation");
  });
});
