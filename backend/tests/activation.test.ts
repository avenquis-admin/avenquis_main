import bcrypt from "bcrypt";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { app } from "../src/app";
import { db } from "../src/db";
import { accessRequests, activationTokens, auditEvents, creditLedger, creditWallets, firmUsers, firms, passwordResetTokens, platformSubscriptions, users } from "../src/db/schema";
import { clearMemoryEmailMessagesForTests, getMemoryEmailMessagesForTests, setEmailTransportForTests } from "../src/services/email";

const serviceToken = process.env.CONTROL_SERVICE_TOKEN!;
const fixtureEmails = ["temporary-login@example.test", "temporary-delivery-failure@example.test"];

async function cleanup(email: string) {
  const [row] = await db.select().from(accessRequests).where(eq(accessRequests.requesterEmail, email)).limit(1);
  if (row) {
    await db.update(accessRequests).set({ provisionedUserId: null, provisionedFirmId: null, subscriptionId: null, walletId: null, activationTokenId: null }).where(eq(accessRequests.id, row.id));
    if (row.walletId) await db.delete(creditLedger).where(eq(creditLedger.walletId, row.walletId));
    await db.delete(activationTokens).where(eq(activationTokens.accessRequestId, row.id));
    await db.delete(creditWallets).where(eq(creditWallets.accessRequestId, row.id));
    await db.delete(platformSubscriptions).where(eq(platformSubscriptions.accessRequestId, row.id));
    if (row.provisionedUserId) {
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, row.provisionedUserId));
      await db.delete(firmUsers).where(eq(firmUsers.userId, row.provisionedUserId));
      await db.delete(users).where(eq(users.id, row.provisionedUserId));
    }
    if (row.provisionedFirmId) await db.delete(firms).where(eq(firms.id, row.provisionedFirmId));
    await db.delete(accessRequests).where(eq(accessRequests.id, row.id));
  }
  await db.delete(users).where(eq(users.email, email));
}

async function createAndApprove(email: string) {
  const created = await request(app).post("/api/v1/public/access-requests").send({
    requestType: "individual", requesterName: "Temporary Login User", requesterEmail: email,
    mobile: "+8801700000301", professionalRole: "Staff", reasonUseCase: "Verify temporary credential flow.",
  });
  const id = created.body.data.id as number;
  const approved = await request(app).post(`/api/v1/control/access-requests/${id}/review`)
    .set("Authorization", `Bearer ${serviceToken}`).send({
      decision: "approved", actor: "Credential Test Admin", actorId: "credential-test-admin",
      actorPlatformRole: "PLATFORM_ADMIN", reason: "Credential flow verification", assignedRole: "STAFF",
      correlationId: `credential-review-${id}`,
    });
  return { id, approved };
}

function temporaryPasswordFromLatestEmail(): string {
  const message = getMemoryEmailMessagesForTests().at(-1);
  expect(message?.subject).toBe("Your AVENQUIS access has been approved");
  expect(message?.text).toContain("You must change this temporary password after your first sign-in.");
  const match = message?.text.match(/Temporary password: (.+)/);
  expect(match).toBeTruthy();
  return match![1].trim();
}

beforeEach(() => clearMemoryEmailMessagesForTests());
afterAll(async () => {
  for (const email of fixtureEmails) await cleanup(email);
  await db.delete(auditEvents).where(eq(auditEvents.actor, "Credential Test Admin"));
});

describe("approved access temporary credentials", () => {
  it("stores only a hash, forces password change, blocks workspace, then enables normal access", async () => {
    await cleanup(fixtureEmails[0]);
    const { id, approved } = await createAndApprove(fixtureEmails[0]);
    expect(approved.status).toBe(200);
    expect(approved.body.data.activationStatus).toBe("delivered");
    const temporaryPassword = temporaryPasswordFromLatestEmail();
    expect(JSON.stringify(approved.body)).not.toContain(temporaryPassword);

    const [user] = await db.select().from(users).where(eq(users.provisioningRequestId, id));
    expect(user.mustChangePassword).toBe(true);
    expect(user.passwordHash).not.toBe(temporaryPassword);
    expect(await bcrypt.compare(temporaryPassword, user.passwordHash)).toBe(true);

    const login = await request(app).post("/api/v1/auth/login").send({ email: fixtureEmails[0], password: temporaryPassword });
    expect(login.status).toBe(200);
    expect(login.body.data.mustChangePassword).toBe(true);
    expect(JSON.stringify(login.body)).not.toContain(temporaryPassword);
    const cookie = login.headers["set-cookie"][0];

    const blocked = await request(app).get("/api/v1/profile").set("Cookie", cookie);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await request(app).post("/api/v1/auth/change-initial-password").set("Cookie", cookie).send({ currentPassword: "WrongTemporary1!", newPassword: "A-new-strong-password1!" })).status).toBe(401);
    expect((await request(app).post("/api/v1/auth/change-initial-password").set("Cookie", cookie).send({ currentPassword: temporaryPassword, newPassword: "weakpassword" })).status).toBe(400);

    expect((await request(app).post("/api/v1/auth/change-initial-password").set("Cookie", cookie).send({ currentPassword: temporaryPassword, newPassword: "A-new-strong-password1!" })).status).toBe(200);
    const [updated] = await db.select().from(users).where(eq(users.id, user.id));
    expect(updated.mustChangePassword).toBe(false);
    expect((await request(app).get("/api/v1/profile").set("Cookie", cookie)).status).toBe(200);
    expect((await request(app).post("/api/v1/auth/login").send({ email: fixtureEmails[0], password: "A-new-strong-password1!" })).status).toBe(200);
  });

  it("keeps provisioning successful and records a retryable failure when delivery fails", async () => {
    await cleanup(fixtureEmails[1]);
    const restore = setEmailTransportForTests({ send: async () => { throw new Error("provider unavailable"); } });
    const { approved } = await createAndApprove(fixtureEmails[1]);
    restore();
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe("provisioned");
    expect(approved.body.data.activationStatus).toBe("delivery_failed");
    expect(JSON.stringify(approved.body)).not.toContain("provider unavailable");
  });
});
