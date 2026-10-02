import bcrypt from "bcrypt";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { app } from "../src/app";
import { db } from "../src/db";
import { accessRequests, auditEvents, chatbotKnowledgeItems, chatbotUsageRecords, creditLedger, creditWallets, firms, firmUsers, platformSubscriptions, usageEvents, users } from "../src/db/schema";
import { writeAuditEvent } from "../src/services/audit";
import { setGroqProviderForTests } from "../src/services/chatbotProviders";

const serviceToken = process.env.CONTROL_SERVICE_TOKEN!;
const originalPassword = "SecurePassword123!";
const changedPassword = "ChangedPassword456!";
const email = `x6-audit-${Date.now()}@example.test`;
let firmId: number;
let userId: number;
let accessRequestId: number;
let subscriptionId: number;
let walletId: number;
let cookie: string;

beforeAll(async () => {
  setGroqProviderForTests({ mode: "GROQ", generate: async () => ({ output: "X6 governed provider response", model: "x6-test-model" }) });
  const suffix = Date.now();
  const [firm] = await db.insert(firms).values({ name: `X6 Audit Firm ${suffix}`, subdomain: `x6-audit-${suffix}`, status: "active" }).returning();
  firmId = firm.id;
  const [user] = await db.insert(users).values({
    email, fullName: "X6 Audit User", passwordHash: await bcrypt.hash(originalPassword, 12), status: "active", accountRole: "FIRM_OWNER",
  }).returning();
  userId = user.id;
  await db.insert(firmUsers).values({ userId, firmId, role: "FIRM_OWNER" });
  const [access] = await db.insert(accessRequests).values({ requestType: "firm", requesterName: "X6 Audit User", requesterEmail: email, mobile: "+8801700000601", reasonUseCase: "X6 audit fixture", firmName: firm.name, auditMetadata: "{}", status: "provisioned" }).returning();
  accessRequestId = access.id;
  const [subscription] = await db.insert(platformSubscriptions).values({ firmId, ownerType: "firm", accessRequestId, plan: "X6 Test", status: "Active" }).returning();
  subscriptionId = subscription.id;
  const [wallet] = await db.insert(creditWallets).values({ ownerType: "firm", firmId, subscriptionId, accessRequestId, balance: 100, status: "active" }).returning();
  walletId = wallet.id;
  await db.insert(creditLedger).values({ walletId, firmId, entryType: "BONUS", amount: 100, balanceAfter: 100, idempotencyKey: `x6-opening-${walletId}`, reason: "X6 fixture" });
  const login = await request(app).post("/api/v1/auth/login").send({ email, password: originalPassword });
  expect(login.status).toBe(200);
  cookie = login.headers["set-cookie"][0].split(";")[0];
});

afterAll(async () => {
  setGroqProviderForTests(null);
  await db.delete(auditEvents).where(eq(auditEvents.actorUserId, String(userId)));
  await db.delete(auditEvents).where(eq(auditEvents.actor, "x6-secret-safety"));
  await db.delete(chatbotUsageRecords).where(eq(chatbotUsageRecords.userId, userId));
  await db.delete(chatbotKnowledgeItems).where(eq(chatbotKnowledgeItems.tenantId, firmId));
  await db.delete(creditLedger).where(eq(creditLedger.walletId, walletId));
  await db.delete(usageEvents).where(eq(usageEvents.walletId, walletId));
  await db.delete(creditWallets).where(eq(creditWallets.id, walletId));
  await db.delete(platformSubscriptions).where(eq(platformSubscriptions.id, subscriptionId));
  await db.delete(accessRequests).where(eq(accessRequests.id, accessRequestId));
  await db.delete(firmUsers).where(and(eq(firmUsers.userId, userId), eq(firmUsers.firmId, firmId)));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(firms).where(eq(firms.id, firmId));
});

describe("Phase X6 standardized cross-platform audit contract", () => {
  it("records password changes with the standard envelope and without credential material", async () => {
    const response = await request(app).post("/api/v1/auth/change-password").set("Cookie", cookie).send({
      currentPassword: originalPassword, newPassword: changedPassword, confirmPassword: changedPassword,
    });
    expect(response.status).toBe(200);
    const [event] = await db.select().from(auditEvents).where(and(eq(auditEvents.actorUserId, String(userId)), eq(auditEvents.action, "PASSWORD_CHANGED"))).limit(1);
    expect(event).toMatchObject({
      actorRoleContext: "FIRM_OWNER", targetUserId: String(userId), targetResourceType: "user",
      targetResourceId: String(userId), previousState: "credential_active", newState: "credential_changed", sourceApplication: "core",
    });
    expect(event.correlationId).toBeTruthy();
    expect(event.reason).toBeTruthy();
    expect(event.details).not.toContain(originalPassword);
    expect(event.details).not.toContain(changedPassword);
  });

  it("records tenant-correct chatbot provider governance without prompts or outputs", async () => {
    const privatePrompt = "X6_PRIVATE_PROMPT_MUST_NOT_BE_AUDITED";
    const response = await request(app).post("/api/v1/ai/assist").set("Cookie", cookie).set("X-Firm-Id", String(firmId)).send({ prompt: privatePrompt });
    expect(response.status).toBe(200);
    const [event] = await db.select().from(auditEvents).where(and(eq(auditEvents.actorUserId, String(userId)), eq(auditEvents.action, "CHATBOT_PROVIDER_INVOKED"))).limit(1);
    expect(event).toMatchObject({ actorRoleContext: "FIRM_OWNER", targetTenantId: String(firmId), targetUserId: String(userId), targetResourceType: "chatbot_provider", targetResourceId: "GROQ", previousState: "requested", newState: "completed", sourceApplication: "core" });
    expect(event.details).not.toContain(privatePrompt);
    expect(event.details).toContain('"usageClass":"AI_STANDARD"');
    expect(event.details).toContain('"memoryOutcome":"candidate_created"');

    const listed = await request(app).get(`/api/v1/control/audit-events?correlationId=${encodeURIComponent(event.correlationId!)}&action=CHATBOT_PROVIDER_INVOKED`).set("Authorization", `Bearer ${serviceToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.total).toBe(1);
    expect(listed.body.data.data[0]).toMatchObject({ id: String(event.id), targetTenantId: String(firmId), correlationId: event.correlationId });
  });

  it("rejects unsafe metadata keys before an audit row can be persisted", async () => {
    await expect(writeAuditEvent(db, {
      actor: "x6-secret-safety", action: "X6_UNSAFE_TEST", targetResourceType: "test", targetResourceId: "unsafe",
      correlationId: "x6-unsafe-correlation", sourceApplication: "core", metadata: { password: "must-not-persist" },
    })).rejects.toMatchObject({ code: "UNSAFE_AUDIT_METADATA" });
    expect(await db.select().from(auditEvents).where(eq(auditEvents.actor, "x6-secret-safety"))).toHaveLength(0);
  });
});
