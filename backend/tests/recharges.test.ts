import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { app } from "../src/app";
import { db } from "../src/db";
import { accessRequests, activationTokens, auditEvents, creditLedger, creditWallets, firms, firmUsers, platformSubscriptions, rechargeRequests, users } from "../src/db/schema";
import { clearMemoryEmailMessagesForTests, getMemoryEmailMessagesForTests } from "../src/services/email";

const controlToken = process.env.CONTROL_SERVICE_TOKEN!;
const password = "SecurePassword123!";
const emails = ["x4-approve@example.test", "x4-reject@example.test", "x4-cancel@example.test"];

async function cleanup(email: string) {
  const [access] = await db.select().from(accessRequests).where(eq(accessRequests.requesterEmail, email)).limit(1);
  if (!access) return;
  await db.update(accessRequests).set({ provisionedUserId: null, provisionedFirmId: null, subscriptionId: null, walletId: null, activationTokenId: null }).where(eq(accessRequests.id, access.id));
  if (access.walletId) { await db.delete(rechargeRequests).where(eq(rechargeRequests.walletId, access.walletId)); await db.delete(creditLedger).where(eq(creditLedger.walletId, access.walletId)); }
  await db.delete(activationTokens).where(eq(activationTokens.accessRequestId, access.id));
  await db.delete(creditWallets).where(eq(creditWallets.accessRequestId, access.id));
  await db.delete(platformSubscriptions).where(eq(platformSubscriptions.accessRequestId, access.id));
  if (access.provisionedUserId) await db.delete(firmUsers).where(eq(firmUsers.userId, access.provisionedUserId));
  if (access.provisionedFirmId) await db.delete(firms).where(eq(firms.id, access.provisionedFirmId));
  if (access.provisionedUserId) await db.delete(users).where(eq(users.id, access.provisionedUserId));
  await db.delete(accessRequests).where(eq(accessRequests.id, access.id));
}

async function provision(email: string, firm = false) {
  await cleanup(email); clearMemoryEmailMessagesForTests();
  const created = await request(app).post("/api/v1/public/access-requests").send(firm ? { requestType: "firm", requesterName: "X4 Partner", requesterEmail: email, mobile: "+8801700000401", firmName: `X4 Firm ${Date.now()}`, partnerName: "X4 Partner", practiceType: "Partnership", firmSize: "5-10", reasonUseCase: "Verify X4 recharge approvals." } : { requestType: "individual", requesterName: "X4 Individual", requesterEmail: email, mobile: "+8801700000402", professionalRole: "Staff", reasonUseCase: "Verify X4 recharge approvals." });
  const id = created.body.data.id;
  const approved = await request(app).post(`/api/v1/control/access-requests/${id}/review`).set("Authorization", `Bearer ${controlToken}`).send({ decision: "approved", actor: "X4 Test Admin", actorId: "x4-admin", actorPlatformRole: "PLATFORM_ADMIN", reason: "X4 fixture provisioning", assignedRole: firm ? "FIRM_OWNER" : "STAFF", correlationId: `x4-provision-${id}` });
  expect(approved.status).toBe(200);
  const tempPassword = getMemoryEmailMessagesForTests().at(-1)?.text.match(/Temporary password: (.+)/)?.[1]?.trim();
  const login = await request(app).post("/api/v1/auth/login").send({ email, password: tempPassword });
  const cookieStr = login.headers["set-cookie"][0].split(";")[0];
  await request(app).post("/api/v1/auth/change-initial-password").set("Cookie", cookieStr).send({ currentPassword: tempPassword, newPassword: password });
  const [wallet] = await db.select().from(creditWallets).where(eq(creditWallets.accessRequestId, id));
  return { wallet, cookie: login.headers["set-cookie"][0].split(";")[0], firmId: wallet.firmId };
}

function userRequest(cookie: string, firmId?: number | null) {
  const call = request(app); // keeps the helper's return type simple for supertest
  return { get: (path: string) => { const r = call.get(path).set("Cookie", cookie); return firmId ? r.set("X-Firm-Id", String(firmId)) : r; }, post: (path: string) => { const r = call.post(path).set("Cookie", cookie); return firmId ? r.set("X-Firm-Id", String(firmId)) : r; } };
}

afterAll(async () => { for (const email of emails) await cleanup(email); await db.delete(auditEvents).where(eq(auditEvents.actor, "X4 Reviewer")); });

describe("Phase X4 recharge and payment approval workflow", () => {
  it("creates an individual request idempotently, exposes history, and warns at the configured threshold", async () => {
    const { wallet, cookie } = await provision(emails[0]);
    await db.update(creditWallets).set({ lowBalanceThreshold: wallet.balance }).where(eq(creditWallets.id, wallet.id));
    const payload = { creditsRequested: 250, paymentReference: `BANK-X4-${wallet.id}`, paymentMethod: "Bank transfer", requesterNote: "Verified bank receipt", idempotencyKey: `x4-create-${wallet.id}` };
    const first = await userRequest(cookie).post("/api/v1/credits/recharges").send(payload);
    const retry = await userRequest(cookie).post("/api/v1/credits/recharges").send(payload);
    expect(first.status).toBe(201); expect(retry.status).toBe(201);
    expect(first.body.data.request.id).toBe(retry.body.data.request.id);
    const history = await userRequest(cookie).get("/api/v1/credits/recharges");
    expect(history.body.data.requests).toHaveLength(1);
    expect(history.body.data.thresholdWarning.isLow).toBe(true);
  });

  it("approves once, returns an exact retry, rejects a different duplicate approval, and exposes the credited balance", async () => {
    const { wallet, cookie } = await provision(emails[0]);
    const created = await userRequest(cookie).post("/api/v1/credits/recharges").send({ creditsRequested: 300, paymentReference: `WIRE-X4-${wallet.id}`, paymentMethod: "Wire", idempotencyKey: `x4-approve-create-${wallet.id}` });
    const requestId = created.body.data.request.id;
    const body = { decision: "APPROVED", reason: "Payment reference verified against settlement", idempotencyKey: `x4-review-${requestId}`, correlationId: `x4-correlation-${requestId}`, actor: "X4 Reviewer", actorId: "reviewer-1", actorPlatformRole: "PLATFORM_ADMIN" };
    const competing = { ...body, idempotencyKey: `${body.idempotencyKey}-competing` };
    const call = (payload: typeof body) => request(app).post(`/api/v1/control/recharge-requests/${requestId}/review`).set("Authorization", `Bearer ${controlToken}`).send(payload);
    const attempts = await Promise.all([call(body), call(competing)]);
    expect(attempts.map((response) => response.status).sort()).toEqual([200, 409]);
    const winner = attempts[0].status === 200 ? body : competing;
    const first = attempts.find((response) => response.status === 200)!;
    const duplicate = attempts.find((response) => response.status === 409)!;
    expect(duplicate.body.error.code).toBe("RECHARGE_ALREADY_REVIEWED");
    const retry = await call(winner);
    expect(retry.status).toBe(200);
    expect(first.body.data.ledgerEntry.id).toBe(retry.body.data.ledgerEntry.id);
    expect((await db.select().from(creditLedger).where(and(
      eq(creditLedger.walletId, wallet.id),
      eq(creditLedger.referenceType, "recharge_request"),
      eq(creditLedger.referenceId, String(requestId)),
    )))).toHaveLength(1);
    const snapshot = await userRequest(cookie).get("/api/v1/credits/wallet");
    expect(snapshot.body.data.wallet.balance).toBe(wallet.balance + 300);
  });

  it("rejects without credit and records the reviewer actor and reason", async () => {
    const { wallet, cookie } = await provision(emails[1]);
    const created = await userRequest(cookie).post("/api/v1/credits/recharges").send({ creditsRequested: 400, paymentReference: `REJECT-X4-${wallet.id}`, paymentMethod: "Card", idempotencyKey: `x4-reject-create-${wallet.id}` });
    const id = created.body.data.request.id;
    const rejected = await request(app).post(`/api/v1/control/recharge-requests/${id}/review`).set("Authorization", `Bearer ${controlToken}`).send({ decision: "REJECTED", reason: "Payment reference could not be reconciled", idempotencyKey: `x4-reject-review-${id}`, correlationId: `x4-reject-correlation-${id}`, actor: "X4 Reviewer", actorId: "reviewer-1", actorPlatformRole: "PLATFORM_ADMIN" });
    expect(rejected.status).toBe(200); expect(rejected.body.data.wallet.balance).toBe(wallet.balance); expect(rejected.body.data.ledgerEntry).toBeUndefined();
    const [audit] = await db.select().from(auditEvents).where(and(eq(auditEvents.actor, "X4 Reviewer"), eq(auditEvents.action, "RECHARGE_REQUEST_REJECTED"))).limit(1);
    expect(audit.details).toContain("Payment reference could not be reconciled"); expect(audit.details).toContain("reviewer-1");
  });

  it("allows a Partner to cancel a pending firm request and blocks later approval", async () => {
    const { cookie, firmId, wallet } = await provision(emails[2], true);
    const created = await userRequest(cookie, firmId).post("/api/v1/credits/recharges").send({ creditsRequested: 500, paymentReference: `CANCEL-X4-${wallet.id}`, paymentMethod: "Bank transfer", idempotencyKey: `x4-cancel-create-${wallet.id}` });
    const id = created.body.data.request.id;
    const cancelled = await userRequest(cookie, firmId).post(`/api/v1/credits/recharges/${id}/cancel`).send({ reason: "Payment transfer was withdrawn" });
    expect(cancelled.body.data.request.status).toBe("CANCELLED");
    const review = await request(app).post(`/api/v1/control/recharge-requests/${id}/review`).set("Authorization", `Bearer ${controlToken}`).send({ decision: "APPROVED", reason: "Late review should fail", idempotencyKey: `x4-late-review-${id}`, correlationId: `x4-late-${id}`, actor: "X4 Reviewer", actorId: "reviewer-1", actorPlatformRole: "PLATFORM_ADMIN" });
    expect(review.status).toBe(409);
  });
});
