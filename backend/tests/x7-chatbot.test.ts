import bcrypt from "bcrypt";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { app } from "../src/app";
import { db } from "../src/db";
import {
  accessRequests, auditEvents, chatbotKnowledgeItems, chatbotUsageRecords, clients, creditLedger, creditWallets,
  engagements, firmUsers, firms, platformSubscriptions, usageEvents, users,
} from "../src/db/schema";
import { ChatbotProvider } from "../src/services/chatbotProviders";
import { setGroqProviderForTests } from "../src/services/chatbotProviders";
import { ApiError } from "../src/middlewares/errorHandler";

const password = "SecurePassword123!";
const serviceToken = process.env.CONTROL_SERVICE_TOKEN!;
let firmA: number; let firmB: number;
let ownerA: number; let managerA: number; let ownerB: number;
let clientA: number; let clientA2: number; let engagementA: number; let engagementA2: number;
let walletA: number; let walletB: number;
let accessA: number; let accessB: number;
let ownerCookie: string; let managerCookie: string;
let providerCalls = 0;

const fakeGroq: ChatbotProvider = {
  mode: "GROQ",
  async generate({ prompt }) {
    providerCalls += 1;
    if (prompt.includes("force provider failure")) throw new ApiError(503, "GROQ_TEST_FAILURE", "Simulated provider failure.");
    return { output: `Groq draft for: ${prompt}`, model: "x7-test-model" };
  },
};

async function login(email: string) {
  const response = await request(app).post("/api/v1/auth/login").send({ email, password });
  expect(response.status).toBe(200);
  return response.headers["set-cookie"][0].split(";")[0];
}

async function ask(cookie: string, firmId: number, prompt: string, key: string, extra: Record<string, unknown> = {}) {
  return request(app).post("/api/v1/ai/assist").set("Cookie", cookie).set("X-Firm-Id", String(firmId)).send({ prompt, idempotencyKey: key, ...extra });
}

async function approved(question: string, answer: string, scope: Partial<typeof chatbotKnowledgeItems.$inferInsert> = {}) {
  const [item] = await db.insert(chatbotKnowledgeItems).values({
    normalizedQuestion: question, intent: "test", answer, category: "general", tenantId: firmA,
    roleScope: JSON.stringify(["FIRM_OWNER"]), source: "x7_test", provider: "LOCAL_BRAIN",
    reviewStatus: "APPROVED", confidence: 100, approvedBy: "x7-admin", approvedAt: new Date(), effectiveFrom: new Date(),
    ...scope,
  }).returning();
  return item;
}

beforeAll(async () => {
  setGroqProviderForTests(fakeGroq);
  const suffix = Date.now();
  const createdFirms = await db.insert(firms).values([
    { name: `X7 Firm A ${suffix}`, subdomain: `x7-a-${suffix}`, status: "active" },
    { name: `X7 Firm B ${suffix}`, subdomain: `x7-b-${suffix}`, status: "active" },
  ]).returning();
  firmA = createdFirms[0].id; firmB = createdFirms[1].id;
  const hash = await bcrypt.hash(password, 12);
  const createdUsers = await db.insert(users).values([
    { email: `x7-owner-a-${suffix}@example.test`, passwordHash: hash, fullName: "X7 Owner A", status: "active", accountRole: "FIRM_OWNER" },
    { email: `x7-manager-a-${suffix}@example.test`, passwordHash: hash, fullName: "X7 Manager A", status: "active", accountRole: "MANAGER" },
    { email: `x7-owner-b-${suffix}@example.test`, passwordHash: hash, fullName: "X7 Owner B", status: "active", accountRole: "FIRM_OWNER" },
  ]).returning();
  [ownerA, managerA, ownerB] = createdUsers.map((user) => user.id);
  await db.insert(firmUsers).values([
    { userId: ownerA, firmId: firmA, role: "FIRM_OWNER" },
    { userId: managerA, firmId: firmA, role: "MANAGER" },
    { userId: ownerB, firmId: firmB, role: "FIRM_OWNER" },
  ]);
  const createdAccess = await db.insert(accessRequests).values([
    { requestType: "firm", requesterName: "X7 Owner A", requesterEmail: createdUsers[0].email, mobile: "+8801700000701", reasonUseCase: "X7 fixture", firmName: createdFirms[0].name, auditMetadata: "{}", status: "provisioned" },
    { requestType: "firm", requesterName: "X7 Owner B", requesterEmail: createdUsers[2].email, mobile: "+8801700000702", reasonUseCase: "X7 fixture", firmName: createdFirms[1].name, auditMetadata: "{}", status: "provisioned" },
  ]).returning();
  accessA = createdAccess[0].id; accessB = createdAccess[1].id;
  const subscriptions = await db.insert(platformSubscriptions).values([
    { firmId: firmA, ownerType: "firm", accessRequestId: accessA, status: "Active", plan: "X7 Test" },
    { firmId: firmB, ownerType: "firm", accessRequestId: accessB, status: "Active", plan: "X7 Test" },
  ]).returning();
  const wallets = await db.insert(creditWallets).values([
    { ownerType: "firm", firmId: firmA, subscriptionId: subscriptions[0].id, accessRequestId: accessA, balance: 5000, status: "active" },
    { ownerType: "firm", firmId: firmB, subscriptionId: subscriptions[1].id, accessRequestId: accessB, balance: 5000, status: "active" },
  ]).returning();
  walletA = wallets[0].id; walletB = wallets[1].id;
  await db.insert(creditLedger).values([
    { walletId: walletA, firmId: firmA, entryType: "BONUS", amount: 5000, balanceAfter: 5000, idempotencyKey: `x7-opening-${walletA}`, reason: "X7 fixture" },
    { walletId: walletB, firmId: firmB, entryType: "BONUS", amount: 5000, balanceAfter: 5000, idempotencyKey: `x7-opening-${walletB}`, reason: "X7 fixture" },
  ]);
  const createdClients = await db.insert(clients).values([
    { firmId: firmA, name: "X7 Client A", status: "active" },
    { firmId: firmA, name: "X7 Client A2", status: "active" },
  ]).returning();
  clientA = createdClients[0].id; clientA2 = createdClients[1].id;
  const createdEngagements = await db.insert(engagements).values([
    { firmId: firmA, clientId: clientA, name: "X7 Engagement A", status: "fieldwork" },
    { firmId: firmA, clientId: clientA2, name: "X7 Engagement A2", status: "planning" },
  ]).returning();
  engagementA = createdEngagements[0].id; engagementA2 = createdEngagements[1].id;
  ownerCookie = await login(createdUsers[0].email);
  managerCookie = await login(createdUsers[1].email);
});

afterAll(async () => {
  setGroqProviderForTests(null);
  await db.delete(auditEvents).where(inArray(auditEvents.targetTenantId, [String(firmA), String(firmB)]));
  await db.delete(chatbotUsageRecords).where(inArray(chatbotUsageRecords.firmId, [firmA, firmB]));
  await db.delete(chatbotKnowledgeItems).where(inArray(chatbotKnowledgeItems.tenantId, [firmA, firmB]));
  await db.delete(creditLedger).where(inArray(creditLedger.walletId, [walletA, walletB]));
  await db.delete(usageEvents).where(inArray(usageEvents.walletId, [walletA, walletB]));
  await db.delete(creditWallets).where(inArray(creditWallets.id, [walletA, walletB]));
  await db.delete(platformSubscriptions).where(inArray(platformSubscriptions.firmId, [firmA, firmB]));
  await db.delete(accessRequests).where(inArray(accessRequests.id, [accessA, accessB]));
  await db.delete(engagements).where(inArray(engagements.id, [engagementA, engagementA2]));
  await db.delete(clients).where(inArray(clients.id, [clientA, clientA2]));
  await db.delete(firmUsers).where(inArray(firmUsers.userId, [ownerA, managerA, ownerB]));
  await db.delete(users).where(inArray(users.id, [ownerA, managerA, ownerB]));
  await db.delete(firms).where(inArray(firms.id, [firmA, firmB]));
});

describe("Phase X7 adaptive local brain and Groq fallback", () => {
  it("serves approved exact and sufficiently similar knowledge locally without Groq", async () => {
    const item = await approved("how do i close a working paper", "Use the approved X7 close workflow.");
    const before = providerCalls;
    const exact = await ask(ownerCookie, firmA, "How do I close a working paper?", "x7-local-exact");
    expect(exact.status).toBe(200);
    expect(exact.body.data).toMatchObject({ providerMode: "LOCAL_BRAIN", usageClass: "LOCAL", localMemoryHit: true, knowledgeItemId: item.id, creditsCharged: 1 });
    const similar = await ask(ownerCookie, firmA, "How do I close the working paper", "x7-local-similar");
    expect(similar.status).toBe(200);
    expect(similar.body.data.providerMode).toBe("LOCAL_BRAIN");
    expect(providerCalls).toBe(before);
  });

  it("falls back for unknown and low-confidence questions and saves CANDIDATE only", async () => {
    await approved("how do i archive a tax file", "Approved archive answer.");
    const first = await ask(ownerCookie, firmA, "Explain an entirely new inventory sampling workflow", "x7-groq-unknown");
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ providerMode: "GROQ", usageClass: "AI_STANDARD", localMemoryHit: false, creditsCharged: 10 });
    const [candidate] = await db.select().from(chatbotKnowledgeItems).where(eq(chatbotKnowledgeItems.id, first.body.data.knowledgeItemId));
    expect(candidate.reviewStatus).toBe("CANDIDATE");
    const calls = providerCalls;
    const repeatedCandidate = await ask(ownerCookie, firmA, "Explain an entirely new inventory sampling workflow", "x7-candidate-not-trusted");
    expect(repeatedCandidate.body.data.providerMode).toBe("GROQ");
    const lowConfidence = await ask(ownerCookie, firmA, "How should a VAT return be reviewed?", "x7-low-confidence");
    expect(lowConfidence.body.data.providerMode).toBe("GROQ");
    expect(providerCalls).toBe(calls + 2);
  });

  it("enforces tenant, user, role, client, and engagement memory scope", async () => {
    await approved("tenant private procedure", "Firm A private answer.");
    const otherTenant = await ask(await login((await db.select().from(users).where(eq(users.id, ownerB)))[0].email), firmB, "tenant private procedure", "x7-other-tenant");
    expect(otherTenant.body.data.providerMode).toBe("GROQ");

    await approved("owner private procedure", "Owner private answer.", { userId: ownerA });
    const otherUser = await ask(managerCookie, firmA, "owner private procedure", "x7-other-user");
    expect(otherUser.body.data.providerMode).toBe("GROQ");

    await approved("scoped engagement procedure", "Scoped engagement answer.", { clientId: clientA, engagementId: engagementA });
    const scoped = await ask(ownerCookie, firmA, "scoped engagement procedure", "x7-scope-hit", { clientId: clientA, engagementId: engagementA });
    expect(scoped.body.data.providerMode).toBe("LOCAL_BRAIN");
    const wrongScope = await ask(ownerCookie, firmA, "scoped engagement procedure", "x7-scope-miss", { clientId: clientA2, engagementId: engagementA2 });
    expect(wrongScope.body.data.providerMode).toBe("GROQ");
  });

  it("uses fresh Core state before stale approved memory", async () => {
    await approved("what is my wallet balance", "The stale balance is 999999 credits.");
    const [wallet] = await db.select().from(creditWallets).where(eq(creditWallets.id, walletA));
    const response = await ask(ownerCookie, firmA, "What is my wallet balance?", "x7-authoritative-balance");
    expect(response.status).toBe(200);
    expect(response.body.data.providerMode).toBe("LOCAL_BRAIN");
    expect(response.body.data.localMemoryHit).toBe(false);
    expect(response.body.data.output).toContain(String(wallet.balance));
    expect(response.body.data.output).not.toContain("999999");
  });

  it("does not charge or create memory when Groq fails", async () => {
    const [before] = await db.select().from(creditWallets).where(eq(creditWallets.id, walletA));
    const response = await ask(ownerCookie, firmA, "force provider failure for this unknown request", "x7-provider-failure");
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("GROQ_TEST_FAILURE");
    const [after] = await db.select().from(creditWallets).where(eq(creditWallets.id, walletA));
    const [usage] = await db.select().from(chatbotUsageRecords).where(eq(chatbotUsageRecords.idempotencyKey, "x7-provider-failure"));
    expect(after.balance).toBe(before.balance);
    expect(usage).toMatchObject({ status: "FAILED", providerSuccess: false, creditsCharged: 0 });
    expect(await db.select().from(chatbotKnowledgeItems).where(eq(chatbotKnowledgeItems.normalizedQuestion, "force provider failure for this unknown request"))).toHaveLength(0);
  });

  it("rejects known insufficient balance before making an external provider call", async () => {
    const [current] = await db.select().from(creditWallets).where(eq(creditWallets.id, walletA));
    await db.update(creditWallets).set({ balance: 0 }).where(eq(creditWallets.id, walletA));
    const calls = providerCalls;
    const response = await ask(ownerCookie, firmA, "An unknown request that needs the provider", "x7-insufficient-balance");
    expect(response.status).toBe(402);
    expect(response.body.error.code).toBe("INSUFFICIENT_CREDIT_BALANCE");
    expect(providerCalls).toBe(calls);
    expect(await db.select().from(chatbotUsageRecords).where(eq(chatbotUsageRecords.idempotencyKey, "x7-insufficient-balance"))).toHaveLength(0);
    await db.update(creditWallets).set({ balance: current.balance }).where(eq(creditWallets.id, walletA));
  });

  it("classifies heavy usage and makes retries replay without double charging", async () => {
    const heavyPrompt = `Provide a comprehensive deep analysis ${Array.from({ length: 90 }, (_, index) => `control${index}`).join(" ")}`;
    const beforeCalls = providerCalls;
    const first = await ask(ownerCookie, firmA, heavyPrompt, "x7-heavy-idempotent");
    const retry = await ask(ownerCookie, firmA, heavyPrompt, "x7-heavy-idempotent");
    expect(first.body.data).toMatchObject({ usageClass: "AI_HEAVY", creditsCharged: 25 });
    expect(retry.body.data.idempotentReplay).toBe(true);
    expect(providerCalls).toBe(beforeCalls + 1);
    expect(await db.select().from(usageEvents).where(eq(usageEvents.idempotencyKey, "chatbot:x7-heavy-idempotent"))).toHaveLength(1);
    expect(await db.select().from(creditLedger).where(eq(creditLedger.idempotencyKey, "usage:chatbot:x7-heavy-idempotent"))).toHaveLength(1);
  });

  it("keeps PET_FUTURE disabled", async () => {
    const response = await ask(ownerCookie, firmA, "Try the future provider", "x7-pet-disabled", { providerMode: "PET_FUTURE" });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("PET_FUTURE_DISABLED");
  });

  it("supports auditable VERIFIED, APPROVED, and RETIRED review without auto-trust", async () => {
    const verifiedCandidate = await db.insert(chatbotKnowledgeItems).values({
      normalizedQuestion: "verified is not approved", intent: "test", answer: "Verified answer", category: "general",
      tenantId: firmA, roleScope: JSON.stringify(["FIRM_OWNER"]), source: "x7_test", provider: "GROQ", reviewStatus: "CANDIDATE",
    }).returning().then((rows) => rows[0]);
    const review = (id: number, decision: string, version: number) => request(app).post(`/api/v1/control/chatbot/knowledge/${id}/review`)
      .set("Authorization", `Bearer ${serviceToken}`).send({ decision, actor: "X7 Control Admin", actorId: "x7-admin", actorPlatformRole: "PLATFORM_ADMIN", reason: `X7 ${decision.toLowerCase()} review`, correlationId: `x7-review-${id}-${decision}`, expectedVersion: version });
    expect((await review(verifiedCandidate.id, "VERIFIED", 1)).status).toBe(200);
    const verifiedAsk = await ask(ownerCookie, firmA, "verified is not approved", "x7-verified-not-trusted");
    expect(verifiedAsk.body.data.providerMode).toBe("GROQ");

    const candidate = await db.insert(chatbotKnowledgeItems).values({
      normalizedQuestion: "approve then retire", intent: "test", answer: "Approved lifecycle answer", category: "general",
      tenantId: firmA, roleScope: JSON.stringify(["FIRM_OWNER"]), source: "x7_test", provider: "GROQ", reviewStatus: "CANDIDATE",
    }).returning().then((rows) => rows[0]);
    const approvedResponse = await review(candidate.id, "APPROVED", 1);
    expect(approvedResponse.status).toBe(200);
    expect((await ask(ownerCookie, firmA, "approve then retire", "x7-approved-hit")).body.data.providerMode).toBe("LOCAL_BRAIN");
    expect((await review(candidate.id, "RETIRED", 2)).status).toBe(200);
    expect((await ask(ownerCookie, firmA, "approve then retire", "x7-retired-miss")).body.data.providerMode).toBe("GROQ");
    const events = await db.select().from(auditEvents).where(eq(auditEvents.actor, "X7 Control Admin"));
    expect(events.map((event) => event.action)).toEqual(expect.arrayContaining(["CHATBOT_MEMORY_VERIFIED", "CHATBOT_MEMORY_APPROVED", "CHATBOT_MEMORY_RETIRED"]));
  });

  it("exposes authoritative metrics and keeps Maintainer review read-only", async () => {
    const list = await request(app).get("/api/v1/control/chatbot/knowledge?status=CANDIDATE").set("Authorization", `Bearer ${serviceToken}`);
    const metrics = await request(app).get(`/api/v1/control/chatbot/metrics?tenantId=${firmA}`).set("Authorization", `Bearer ${serviceToken}`);
    expect(list.status).toBe(200); expect(list.body.data.total).toBeGreaterThan(0);
    expect(metrics.status).toBe(200); expect(metrics.body.data).toMatchObject({ localHits: expect.any(Number), groqCalls: expect.any(Number), candidateCount: expect.any(Number) });
    const candidate = list.body.data.data[0];
    const denied = await request(app).post(`/api/v1/control/chatbot/knowledge/${candidate.id}/review`).set("Authorization", `Bearer ${serviceToken}`).send({
      decision: "APPROVED", actor: "X7 Maintainer", actorId: "x7-maintainer", actorPlatformRole: "PLATFORM_MAINTAINER",
      reason: "Maintainer must remain read only", correlationId: "x7-maintainer-denied", expectedVersion: candidate.version,
    });
    expect(denied.status).toBe(403);
  });
});
