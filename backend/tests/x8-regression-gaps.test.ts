import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { app } from "../src/app";
import { db } from "../src/db";
import {
  accessRequests, activationTokens, auditEvents, chatbotKnowledgeItems, chatbotUsageRecords,
  creditLedger, creditWallets, platformSubscriptions, rechargeRequests, usageEvents, users, firms, firmUsers,
} from "../src/db/schema";
import { clearMemoryEmailMessagesForTests, getMemoryEmailMessagesForTests } from "../src/services/email";
import { setGroqProviderForTests } from "../src/services/chatbotProviders";

const serviceToken = process.env.CONTROL_SERVICE_TOKEN!;
const password = "X8-Secure-Password-123!";
const individualEmail = "x8-individual@example.test";
const rejectedEmail = "x8-rejected@example.test";

async function cleanup(email: string) {
  const [access] = await db.select().from(accessRequests).where(eq(accessRequests.requesterEmail, email)).limit(1);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (user) {
    await db.delete(chatbotUsageRecords).where(eq(chatbotUsageRecords.userId, user.id));
    await db.delete(chatbotKnowledgeItems).where(eq(chatbotKnowledgeItems.userId, user.id));
  }
  if (access?.walletId) {
    await db.delete(rechargeRequests).where(eq(rechargeRequests.walletId, access.walletId));
    await db.delete(creditLedger).where(eq(creditLedger.walletId, access.walletId));
    await db.delete(usageEvents).where(eq(usageEvents.walletId, access.walletId));
  }
  if (access) {
    if (access.provisionedFirmId) {
      await db.update(accessRequests).set({ provisionedUserId: null, provisionedFirmId: null, subscriptionId: null, walletId: null, activationTokenId: null }).where(eq(accessRequests.id, access.id));
      await db.delete(firmUsers).where(eq(firmUsers.firmId, access.provisionedFirmId));
      await db.delete(creditWallets).where(eq(creditWallets.firmId, access.provisionedFirmId));
      await db.delete(platformSubscriptions).where(eq(platformSubscriptions.firmId, access.provisionedFirmId));
      await db.delete(firms).where(eq(firms.id, access.provisionedFirmId));
    }
    
    await db.delete(activationTokens).where(eq(activationTokens.accessRequestId, access.id));
    await db.delete(creditWallets).where(eq(creditWallets.accessRequestId, access.id));
    await db.delete(platformSubscriptions).where(eq(platformSubscriptions.accessRequestId, access.id));
  }
  if (user) {
      await db.delete(firmUsers).where(eq(firmUsers.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  if (access) {
    await db.update(firms).set({ provisioningRequestId: null }).where(eq(firms.provisioningRequestId, access.id));
    if (access.provisionedFirmId) {
      await db.update(accessRequests).set({ provisionedUserId: null, provisionedFirmId: null, subscriptionId: null, walletId: null, activationTokenId: null }).where(eq(accessRequests.id, access.id));
      await db.delete(firmUsers).where(eq(firmUsers.firmId, access.provisionedFirmId));
      await db.delete(creditWallets).where(eq(creditWallets.firmId, access.provisionedFirmId));
      await db.delete(platformSubscriptions).where(eq(platformSubscriptions.firmId, access.provisionedFirmId));
      await db.delete(firms).where(eq(firms.id, access.provisionedFirmId));
    }
    await db.delete(firms).where(eq(firms.provisioningRequestId, access.id));
    await db.delete(accessRequests).where(eq(accessRequests.id, access.id));
  }
  await db.delete(auditEvents).where(eq(auditEvents.actor, `public:${email}`));
}

async function createIndividual(email: string) {
  const created = await request(app).post("/api/v1/public/access-requests").send({
    requestType: "firm", firmName: "X8 Firm Test", partnerName: "X8 Partner", practiceType: "Partnership", firmSize: "5-10", requesterName: "X8 Individual", requesterEmail: email,
    mobile: "+8801700000801", professionalRole: "Staff", reasonUseCase: "X8 live workflow regression.",
  });
  expect(created.status).toBe(201);
  return created.body.data.id as number;
}

function activationTokenFor(email: string) {
  const message = [...getMemoryEmailMessagesForTests()].reverse().find((item) => item.to === email && item.subject.includes("approved"));
  const match = message?.text.match(/Temporary password: (.+)/);
  expect(match).toBeTruthy();
  return match![1].trim();
}

beforeEach(async () => {
  clearMemoryEmailMessagesForTests();
  await cleanup(individualEmail);
  await cleanup(rejectedEmail);
});

afterAll(async () => {
  setGroqProviderForTests(null);
  await cleanup(individualEmail);
  await cleanup(rejectedEmail);
});

describe("Phase X8 regression compatibility gaps", () => {
  it("lets an activated individual consume a metered Guide service and recharge the personal wallet", async () => {
    setGroqProviderForTests({
      mode: "GROQ",
      async generate() { return { output: "X8 individual Guide draft.", model: "x8-test-model" }; },
    });
    const id = await createIndividual(individualEmail);
    const approved = await request(app).post(`/api/v1/control/access-requests/${id}/review`)
      .set("Authorization", `Bearer ${serviceToken}`).send({
        decision: "approved", actor: "X8 Admin", actorId: "x8-admin", actorPlatformRole: "PLATFORM_ADMIN",
        reason: "X8 individual workflow approval", assignedRole: "FIRM_OWNER", correlationId: `x8-individual-${id}`,
      });
    expect(approved.status).toBe(200); console.log("APPROVED BODY:", JSON.stringify(approved.body.data));
    expect(approved.body.data.provisionedFirmId).toBeDefined();
    const tempPassword = activationTokenFor(individualEmail);
    const login = await request(app).post("/api/v1/auth/login").send({ email: individualEmail, password: tempPassword });
    expect(login.status).toBe(200);
    const cookieStr = login.headers["set-cookie"][0].split(";")[0];
    const activated = await request(app).post("/api/v1/auth/change-initial-password").set("Cookie", cookieStr).send({ currentPassword: tempPassword, newPassword: password });
    expect(activated.status).toBe(200);
    const cookie = cookieStr;
    const before = await request(app).get("/api/v1/credits/wallet").set("Cookie", cookie).set("X-Firm-Id", String(approved.body.data.provisionedFirmId));
    const used = await request(app).post("/api/v1/ai/assist").set("Cookie", cookie).set("X-Firm-Id", String(approved.body.data.provisionedFirmId)).send({
      prompt: "Explain the X8 individual onboarding workflow", idempotencyKey: `x8-individual-usage-${id}`,
    });
    console.log("USED BODY:", JSON.stringify(used.body)); expect(used.status).toBe(200);
    expect(used.body.data).toMatchObject({ providerMode: "GROQ", usageClass: "AI_STANDARD", creditsCharged: 10 });
    const replay = await request(app).post("/api/v1/ai/assist").set("Cookie", cookie).set("X-Firm-Id", String(approved.body.data.provisionedFirmId)).send({
      prompt: "Explain the X8 individual onboarding workflow", idempotencyKey: `x8-individual-usage-${id}`,
    });
    expect(replay.body.data.idempotentReplay).toBe(true);
    const after = await request(app).get("/api/v1/credits/wallet").set("Cookie", cookie).set("X-Firm-Id", String(approved.body.data.provisionedFirmId));
    expect(after.body.data.wallet.balance).toBe(before.body.data.wallet.balance - 10);
    const [individualUser] = await db.select().from(users).where(eq(users.email, individualEmail)).limit(1);
    const [candidate] = await db.select().from(chatbotKnowledgeItems).where(eq(chatbotKnowledgeItems.tenantId, Number(approved.body.data.provisionedFirmId))).limit(1);
    expect(candidate).toMatchObject({ tenantId: Number(approved.body.data.provisionedFirmId), reviewStatus: "CANDIDATE" });

    const recharge = await request(app).post("/api/v1/credits/recharges").set("Cookie", cookie).set("X-Firm-Id", String(approved.body.data.provisionedFirmId)).send({
      creditsRequested: 40, paymentReference: `X8-IND-${id}`, paymentMethod: "Bank transfer", idempotencyKey: `x8-individual-recharge-${id}`,
    });
    const reviewed = await request(app).post(`/api/v1/control/recharge-requests/${recharge.body.data.request.id}/review`)
      .set("Authorization", `Bearer ${serviceToken}`).send({
        decision: "APPROVED", reason: "X8 payment verified", idempotencyKey: `x8-individual-recharge-review-${id}`,
        correlationId: `x8-individual-recharge-correlation-${id}`, actor: "X8 Admin", actorId: "x8-admin", actorPlatformRole: "PLATFORM_ADMIN",
      });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.data.wallet.balance).toBe(after.body.data.wallet.balance + 40);
  });

  it("sends a safe rejection notification without provisioning an account", async () => {
    const id = await createIndividual(rejectedEmail);
    const rejected = await request(app).post(`/api/v1/control/access-requests/${id}/review`)
      .set("Authorization", `Bearer ${serviceToken}`).send({
        decision: "rejected", actor: "X8 Admin", actorId: "x8-admin", actorPlatformRole: "PLATFORM_ADMIN",
        reason: "Required professional information was not supplied", correlationId: `x8-rejection-${id}`,
      });
    expect(rejected.status).toBe(200);
    expect(rejected.body).toMatchObject({ newState: "rejected", notification: { status: "delivered", provider: "memory" } });
    const message = getMemoryEmailMessagesForTests().find((item) => item.to === rejectedEmail);
    expect(message?.subject).toContain("access request");
    expect(message?.text).toContain("Required professional information was not supplied");
    expect(message?.text).not.toMatch(/password|activate\?token=/i);
    expect(await db.select().from(users).where(eq(users.email, rejectedEmail))).toHaveLength(0);
  });
});


























