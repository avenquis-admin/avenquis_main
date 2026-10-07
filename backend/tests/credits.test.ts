import bcrypt from "bcrypt";
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import { app } from "../src/app";
import { db } from "../src/db";
import {
  accessRequests,
  activationTokens,
  auditEvents,
  creditLedger,
  creditWallets,
  firms,
  firmUsers,
  platformSubscriptions,
  usageEvents,
  users,
} from "../src/db/schema";
import { consumeCredits } from "../src/services/creditAccounting";
import { clearMemoryEmailMessagesForTests, getMemoryEmailMessagesForTests } from "../src/services/email";

const controlToken = process.env.CONTROL_SERVICE_TOKEN!;
const password = "SecurePassword123!";
const fixtureEmails = [
  "x3-initial@example.test",
  "x3-idempotent@example.test",
  "x3-partner@example.test",
  "x3-staff@example.test",
  "x3-adjustment@example.test",
];

async function cleanup(email: string) {
  const [accessRequest] = await db.select().from(accessRequests).where(eq(accessRequests.requesterEmail, email)).limit(1);
  if (accessRequest) {
    await db.update(accessRequests).set({ provisionedUserId: null, provisionedFirmId: null, subscriptionId: null, walletId: null, activationTokenId: null }).where(eq(accessRequests.id, accessRequest.id));
    if (accessRequest.walletId) {
      await db.delete(creditLedger).where(eq(creditLedger.walletId, accessRequest.walletId));
      await db.delete(usageEvents).where(eq(usageEvents.walletId, accessRequest.walletId));
    }
    await db.delete(activationTokens).where(eq(activationTokens.accessRequestId, accessRequest.id));
    await db.delete(creditWallets).where(eq(creditWallets.accessRequestId, accessRequest.id));
    await db.delete(platformSubscriptions).where(eq(platformSubscriptions.accessRequestId, accessRequest.id));
    if (accessRequest.provisionedUserId) await db.delete(firmUsers).where(eq(firmUsers.userId, accessRequest.provisionedUserId));
    if (accessRequest.provisionedFirmId) await db.delete(firms).where(eq(firms.id, accessRequest.provisionedFirmId));
    if (accessRequest.provisionedUserId) await db.delete(users).where(eq(users.id, accessRequest.provisionedUserId));
    await db.delete(accessRequests).where(eq(accessRequests.id, accessRequest.id));
  }
  await db.delete(users).where(eq(users.email, email));
}

async function provisionAndActivate(email: string, firm: boolean) {
  await cleanup(email);
  clearMemoryEmailMessagesForTests();
  const created = await request(app).post("/api/v1/public/access-requests").send(firm ? {
    requestType: "firm", requesterName: "X3 Partner", requesterEmail: email, mobile: "+8801700000301",
    firmName: `X3 Ledger ${Date.now()}`, partnerName: "X3 Partner", practiceType: "Partnership", firmSize: "5-10",
    reasonUseCase: "Verify X3 shared wallet accounting.",
  } : {
    requestType: "individual", requesterName: "X3 Individual", requesterEmail: email, mobile: "+8801700000302",
    professionalRole: "Staff", reasonUseCase: "Verify X3 individual wallet accounting.",
  });
  expect(created.status).toBe(201);
  const requestId = created.body.data.id as number;
  const approved = await request(app).post(`/api/v1/control/access-requests/${requestId}/review`)
    .set("Authorization", `Bearer ${controlToken}`)
    .send({ decision: "approved", actor: "X3 Test Admin", actorId: "x3-admin", actorPlatformRole: "PLATFORM_ADMIN", reason: "X3 ledger verification", assignedRole: firm ? "FIRM_OWNER" : "STAFF", correlationId: `x3-provision-${requestId}` });
  expect(approved.status).toBe(200);
  const match = getMemoryEmailMessagesForTests().at(-1)?.text.match(/Temporary password: (.+)/);
  expect(match).toBeTruthy();
  const tempPassword = match[1].trim();
  const loginRes = await request(app).post("/api/v1/auth/login").send({ email, password: tempPassword });
  expect(loginRes.status).toBe(200);
  const cookie = loginRes.headers["set-cookie"][0].split(";")[0];
  const activated = await request(app).post("/api/v1/auth/change-initial-password").set("Cookie", cookie).send({ currentPassword: tempPassword, newPassword: password });
  expect(activated.status).toBe(200);
  const [user] = await db.select().from(users).where(eq(users.provisioningRequestId, requestId));
  const [wallet] = await db.select().from(creditWallets).where(eq(creditWallets.accessRequestId, requestId));
  return { requestId, user, wallet, firmId: wallet.firmId || undefined };
}

async function loginCookie(email: string) {
  const response = await request(app).post("/api/v1/auth/login").send({ email, password });
  expect(response.status).toBe(200);
  return response.headers["set-cookie"][0].split(";")[0];
}

afterAll(async () => {
  for (const email of fixtureEmails) await cleanup(email);
  await db.delete(auditEvents).where(eq(auditEvents.actor, "X3 Test Admin"));
});

describe("Phase X3 subscription, wallet, and credit ledger", () => {
  it("provisions initial credits as a BONUS and reconciles wallet balance to the ledger", async () => {
    const { wallet } = await provisionAndActivate(fixtureEmails[0], false);
    const entries = await db.select().from(creditLedger).where(eq(creditLedger.walletId, wallet.id));
    expect(wallet.balance).toBe(1000);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ entryType: "BONUS", amount: 1000, balanceAfter: 1000 });
    const [total] = await db.select({ value: sql<number>`sum(${creditLedger.amount})::int` }).from(creditLedger).where(eq(creditLedger.walletId, wallet.id));
    expect(Number(total.value)).toBe(wallet.balance);
  });

  it("charges individual usage exactly once for an idempotent retry", async () => {
    const { user, wallet } = await provisionAndActivate(fixtureEmails[1], false);
    const input = { userId: user.id, service: "x3-test-service", units: 2, credits: 75, idempotencyKey: `x3-usage-${wallet.id}`, correlationId: `x3-correlation-${wallet.id}`, reason: "X3 idempotent usage test" };
    const first = await consumeCredits(input);
    const retry = await consumeCredits(input);
    expect(first.usageEvent.id).toBe(retry.usageEvent.id);
    expect(retry.wallet.balance).toBe(925);
    expect(await db.select().from(usageEvents).where(eq(usageEvents.walletId, wallet.id))).toHaveLength(1);
    expect((await db.select().from(creditLedger).where(eq(creditLedger.walletId, wallet.id))).filter((entry) => entry.entryType === "USAGE")).toHaveLength(1);
    expect(retry.reconciliation).toMatchObject({ walletBalance: 925, ledgerBalance: 925, matches: true });
  });

  it("lets a firm member consume the shared wallet atomically without overspending and limits inspection to Partners", async () => {
    const { user: partner, wallet, firmId } = await provisionAndActivate(fixtureEmails[2], true);
    const [staff] = await db.insert(users).values({ email: fixtureEmails[3], passwordHash: await bcrypt.hash(password, 12), fullName: "X3 Staff", status: "active", accountRole: "STAFF" }).returning();
    await db.insert(firmUsers).values({ userId: staff.id, firmId: firmId!, role: "STAFF" });

    const attempts = await Promise.allSettled([
      consumeCredits({ userId: staff.id, firmId, service: "x3-concurrent", units: 1, credits: 4000, idempotencyKey: `x3-concurrent-a-${wallet.id}`, correlationId: `x3-a-${wallet.id}`, reason: "X3 concurrent debit A" }),
      consumeCredits({ userId: staff.id, firmId, service: "x3-concurrent", units: 1, credits: 4000, idempotencyKey: `x3-concurrent-b-${wallet.id}`, correlationId: `x3-b-${wallet.id}`, reason: "X3 concurrent debit B" }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((attempt): attempt is PromiseRejectedResult => attempt.status === "rejected");
    expect(rejected).toBeDefined();
    expect(rejected!.reason).toMatchObject({ statusCode: 402, code: "INSUFFICIENT_CREDIT_BALANCE" });
    const [updated] = await db.select().from(creditWallets).where(eq(creditWallets.id, wallet.id));
    expect(updated.balance).toBe(1000);

    const partnerCookie = await loginCookie(partner.email);
    expect((await request(app).get("/api/v1/credits/activity").set("Cookie", partnerCookie).set("X-Firm-Id", String(firmId))).status).toBe(200);
    const staffCookie = await loginCookie(staff.email);
    expect((await request(app).get("/api/v1/credits/wallet").set("Cookie", staffCookie).set("X-Firm-Id", String(firmId))).status).toBe(200);
    const denied = await request(app).get("/api/v1/credits/activity").set("Cookie", staffCookie).set("X-Firm-Id", String(firmId));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("CREDIT_USAGE_INSPECTION_FORBIDDEN");
  });

  it("requires a reason for a Control adjustment, applies it once, and leaves a reconciled audit trail", async () => {
    const { wallet } = await provisionAndActivate(fixtureEmails[4], false);
    const endpoint = `/api/v1/control/credit-wallets/${wallet.id}/adjustments`;
    const invalid = await request(app).post(endpoint).set("Authorization", `Bearer ${controlToken}`).send({ amount: 25 });
    expect(invalid.status).toBe(400);
    const body = { amount: 25, reason: "Correct an audited allocation discrepancy", idempotencyKey: `x3-adjustment-${wallet.id}`, correlationId: `x3-adjustment-correlation-${wallet.id}`, actor: "X3 Test Admin", actorId: "x3-admin", actorPlatformRole: "PLATFORM_ADMIN" };
    const first = await request(app).post(endpoint).set("Authorization", `Bearer ${controlToken}`).send(body);
    const retry = await request(app).post(endpoint).set("Authorization", `Bearer ${controlToken}`).send(body);
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(first.body.data.ledgerEntry.id).toBe(retry.body.data.ledgerEntry.id);
    expect(retry.body.data.wallet.balance).toBe(1025);
    expect(retry.body.data.reconciliation).toMatchObject({ walletBalance: 1025, ledgerBalance: 1025, matches: true });
    expect((await db.select().from(creditLedger).where(eq(creditLedger.idempotencyKey, body.idempotencyKey)))).toHaveLength(1);
  });
});

