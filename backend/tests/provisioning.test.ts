import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
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
  users,
} from "../src/db/schema";

const token = process.env.CONTROL_SERVICE_TOKEN!;
const emails = ["x1-individual@example.test", "x1-firm@example.test", "x1-conflict@example.test"];

async function removeProvisioningFixture(email: string): Promise<void> {
  const [accessRequest] = await db.select().from(accessRequests).where(eq(accessRequests.requesterEmail, email)).limit(1);
  if (!accessRequest) {
    await db.delete(users).where(eq(users.email, email));
    return;
  }
  await db.update(accessRequests).set({
    provisionedUserId: null,
    provisionedFirmId: null,
    subscriptionId: null,
    walletId: null,
    activationTokenId: null,
  }).where(eq(accessRequests.id, accessRequest.id));
  if (accessRequest.walletId) await db.delete(creditLedger).where(eq(creditLedger.walletId, accessRequest.walletId));
  await db.delete(activationTokens).where(eq(activationTokens.accessRequestId, accessRequest.id));
  await db.delete(creditWallets).where(eq(creditWallets.accessRequestId, accessRequest.id));
  await db.delete(platformSubscriptions).where(eq(platformSubscriptions.accessRequestId, accessRequest.id));
  if (accessRequest.provisionedUserId) await db.delete(firmUsers).where(eq(firmUsers.userId, accessRequest.provisionedUserId));
  if (accessRequest.provisionedFirmId) await db.delete(firms).where(eq(firms.id, accessRequest.provisionedFirmId));
  if (accessRequest.provisionedUserId) await db.delete(users).where(eq(users.id, accessRequest.provisionedUserId));
  await db.delete(accessRequests).where(eq(accessRequests.id, accessRequest.id));
  await db.delete(users).where(eq(users.email, email));
  await db.delete(auditEvents).where(eq(auditEvents.actor, `public:${email}`));
}

async function approve(id: number, role: "FIRM_OWNER" | "STAFF", correlationId: string) {
  return request(app)
    .post(`/api/v1/control/access-requests/${id}/review`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      decision: "approved",
      actor: "X1 Test Admin",
      actorId: "x1-test-admin",
      actorPlatformRole: "PLATFORM_ADMIN",
      reason: "X1 provisioning verification",
      assignedRole: role,
      correlationId,
    });
}

afterAll(async () => {
  for (const email of emails) await removeProvisioningFixture(email);
  await db.delete(auditEvents).where(eq(auditEvents.actor, "X1 Test Admin"));
});

describe("Phase X1 Core-Control provisioning", () => {
  it("provisions an individual exactly once and returns the same records on retry", async () => {
    await removeProvisioningFixture(emails[0]);
    const created = await request(app).post("/api/v1/public/access-requests").send({
      requestType: "individual",
      requesterName: "X1 Individual",
      requesterEmail: emails[0],
      mobile: "+8801700000101",
      professionalRole: "Staff",
      reasonUseCase: "Verify individual X1 provisioning.",
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    const first = await approve(id, "STAFF", "x1-individual-review");
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe("provisioned");
    expect(first.body.data.provisionedFirmId).toBeUndefined();

    const beforeRetry = first.body.data;
    const retry = await request(app)
      .post(`/api/v1/control/access-requests/${id}/provision`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        actor: "X1 Test Admin",
        actorId: "x1-test-admin",
        actorPlatformRole: "PLATFORM_ADMIN",
        correlationId: "x1-individual-retry",
        idempotencyKey: `access-request:${id}`,
      });
    expect(retry.status).toBe(200);
    expect(retry.body.provisioning.userId).toBe(beforeRetry.provisionedUserId);
    expect(retry.body.provisioning.subscriptionId).toBe(beforeRetry.subscriptionId);
    expect(retry.body.provisioning.walletId).toBe(beforeRetry.walletId);
    expect(retry.body.provisioning.activationTokenId).toBe(beforeRetry.activationTokenId);
    expect(retry.body.provisioning.provisioningAttempts).toBe(1);

    expect(await db.select().from(users).where(eq(users.provisioningRequestId, id))).toHaveLength(1);
    const [provisionedUser] = await db.select().from(users).where(eq(users.provisioningRequestId, id));
    expect(provisionedUser.accountRole).toBe("STAFF");
    expect(await db.select().from(platformSubscriptions).where(eq(platformSubscriptions.accessRequestId, id))).toHaveLength(1);
    expect(await db.select().from(creditWallets).where(eq(creditWallets.accessRequestId, id))).toHaveLength(1);
    expect(await db.select().from(activationTokens).where(eq(activationTokens.accessRequestId, id))).toHaveLength(1);
  });

  it("provisions a firm, its owner, subscription, wallet, initial ledger entry, and activation token atomically", async () => {
    await removeProvisioningFixture(emails[1]);
    const created = await request(app).post("/api/v1/public/access-requests").send({
      requestType: "firm",
      requesterName: "X1 Firm Owner",
      requesterEmail: emails[1],
      mobile: "+8801700000102",
      firmName: "X1 Assurance & Co",
      partnerName: "X1 Firm Owner",
      practiceType: "Partnership",
      firmSize: "5-10",
      reasonUseCase: "Verify firm X1 provisioning.",
    });
    const id = created.body.data.id;
    const reviewed = await approve(id, "FIRM_OWNER", "x1-firm-review");
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.data.status).toBe("provisioned");

    const [firm] = await db.select().from(firms).where(eq(firms.provisioningRequestId, id));
    const [user] = await db.select().from(users).where(eq(users.provisioningRequestId, id));
    const memberships = await db.select().from(firmUsers).where(and(eq(firmUsers.firmId, firm.id), eq(firmUsers.userId, user.id)));
    const [wallet] = await db.select().from(creditWallets).where(eq(creditWallets.accessRequestId, id));
    const ledger = await db.select().from(creditLedger).where(eq(creditLedger.walletId, wallet.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe("FIRM_OWNER");
    expect(user.accountRole).toBe("FIRM_OWNER");
    expect(wallet.balance).toBe(5000);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amount).toBe(5000);
  });

  it("rolls back partial records and marks the request failed when provisioning cannot create its user", async () => {
    await removeProvisioningFixture(emails[2]);
    await db.insert(users).values({ email: emails[2], passwordHash: "preexisting-hash" });
    const created = await request(app).post("/api/v1/public/access-requests").send({
      requestType: "individual",
      requesterName: "X1 Conflict",
      requesterEmail: emails[2],
      mobile: "+8801700000103",
      professionalRole: "Staff",
      reasonUseCase: "Verify atomic rollback on identity collision.",
    });
    const id = created.body.data.id;
    const reviewed = await approve(id, "STAFF", "x1-failure-review");
    expect(reviewed.status).toBe(500);
    const [failed] = await db.select().from(accessRequests).where(eq(accessRequests.id, id));
    expect(failed.status).toBe("failed");
    expect(failed.provisioningError).toBeTruthy();
    expect(await db.select().from(platformSubscriptions).where(eq(platformSubscriptions.accessRequestId, id))).toHaveLength(0);
    expect(await db.select().from(creditWallets).where(eq(creditWallets.accessRequestId, id))).toHaveLength(0);
    expect(await db.select().from(activationTokens).where(eq(activationTokens.accessRequestId, id))).toHaveLength(0);
  });
});
