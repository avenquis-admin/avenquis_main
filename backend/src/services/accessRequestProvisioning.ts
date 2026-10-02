import crypto from "crypto";
import bcrypt from "bcrypt";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  accessRequests,
  activationTokens,
  creditLedger,
  creditWallets,
  firms,
  firmUsers,
  platformSubscriptions,
  users,
} from "../db/schema";
import { env } from "../config/env";
import { ApiError } from "../middlewares/errorHandler";
import { writeAuditEvent } from "./audit";
import { generateTemporaryPassword } from "./temporaryPassword";

const STALE_PROVISIONING_MS = 5 * 60 * 1000;
const INDIVIDUAL_ROLES = new Set(["PARTNER", "MANAGER", "STAFF", "ARTICLED_STUDENT"]);

export interface ProvisioningActor {
  actor: string;
  actorId: string;
  actorPlatformRole: "PLATFORM_ADMIN" | "PLATFORM_MAINTAINER";
  correlationId: string;
  idempotencyKey: string;
  ipAddress?: string;
}

function slugFor(name: string, requestId: number): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "firm";
  return `${base}-${requestId}`;
}

function resultFromRequest(request: typeof accessRequests.$inferSelect) {
  return {
    requestId: String(request.id),
    status: request.status,
    userId: request.provisionedUserId ? String(request.provisionedUserId) : undefined,
    firmId: request.provisionedFirmId ? String(request.provisionedFirmId) : undefined,
    subscriptionId: request.subscriptionId ? String(request.subscriptionId) : undefined,
    walletId: request.walletId ? String(request.walletId) : undefined,
    activationTokenId: request.activationTokenId ? String(request.activationTokenId) : undefined,
    provisioningAttempts: request.provisioningAttempts,
    provisionedAt: request.provisionedAt,
    idempotencyKey: request.provisioningIdempotencyKey,
  };
}

function validateProvisioningRequest(request: typeof accessRequests.$inferSelect): void {
  if (!request.assignedRole) throw new ApiError(409, "PROVISIONING_ROLE_REQUIRED", "An approved role is required before provisioning.");
  if (request.requestType === "firm") {
    if (!request.firmName) throw new ApiError(409, "PROVISIONING_FIRM_NAME_REQUIRED", "A firm request requires a firm name.");
    if (request.assignedRole !== "FIRM_OWNER") throw new ApiError(409, "INVALID_PROVISIONING_ROLE", "Firm requests must provision the requester as FIRM_OWNER.");
    if (request.assignedFirmId) throw new ApiError(409, "EXISTING_FIRM_PROVISIONING_UNSUPPORTED", "X1 provisions a new firm and owner; an existing Control firm ID cannot be used.");
    return;
  }
  if (request.requestType !== "individual") throw new ApiError(409, "INVALID_REQUEST_TYPE", "Only individual and firm requests can be provisioned.");
  if (!INDIVIDUAL_ROLES.has(request.assignedRole)) throw new ApiError(409, "INVALID_PROVISIONING_ROLE", "The assigned role is not valid for an individual request.");
}

async function claimProvisioning(requestId: number, input: ProvisioningActor) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(accessRequests).where(eq(accessRequests.id, requestId)).limit(1);
    if (!current) throw new ApiError(404, "ACCESS_REQUEST_NOT_FOUND", "Access request not found.");
    if (current.provisioningIdempotencyKey && current.provisioningIdempotencyKey !== input.idempotencyKey) {
      throw new ApiError(409, "PROVISIONING_IDEMPOTENCY_CONFLICT", "This access request is bound to a different provisioning idempotency key.");
    }
    if (current.status === "provisioned") return { completed: current, claimed: null };

    const staleBefore = new Date(Date.now() - STALE_PROVISIONING_MS);
    const retryingStaleClaim = current.status === "provisioning" && current.updatedAt < staleBefore;
    if (!["approved", "failed"].includes(current.status) && !retryingStaleClaim) {
      throw new ApiError(409, "ACCESS_REQUEST_STATE_CONFLICT", `Access request cannot be provisioned from '${current.status}' state.`);
    }
    validateProvisioningRequest(current);

    const stateGuard = current.status === "provisioning"
      ? and(eq(accessRequests.status, "provisioning"), lt(accessRequests.updatedAt, staleBefore))
      : eq(accessRequests.status, current.status as "approved" | "failed");
    const startedAt = new Date();
    const [claimed] = await tx.update(accessRequests).set({
      status: "provisioning",
      provisioningIdempotencyKey: input.idempotencyKey,
      provisioningAttempts: sql`${accessRequests.provisioningAttempts} + 1`,
      provisioningStartedAt: startedAt,
      provisioningError: null,
      updatedAt: startedAt,
    }).where(and(eq(accessRequests.id, requestId), stateGuard)).returning();
    if (!claimed) throw new ApiError(409, "PROVISIONING_IN_PROGRESS", "Provisioning is already in progress for this access request.");

    await writeAuditEvent(tx, {
      actor: input.actor, actorUserId: input.actorId, actorRoleContext: input.actorPlatformRole,
      action: retryingStaleClaim || current.status === "failed" ? "ACCESS_REQUEST_PROVISIONING_RETRIED" : "ACCESS_REQUEST_PROVISIONING_STARTED",
      targetResourceType: "access_request", targetResourceId: requestId,
      previousState: current.status, newState: "provisioning", correlationId: input.correlationId,
      reason: retryingStaleClaim || current.status === "failed" ? "Retrying recoverable provisioning" : "Approved access provisioning started",
      sourceApplication: "control", metadata: { idempotencyKey: input.idempotencyKey, attempt: claimed.provisioningAttempts, ipAddress: input.ipAddress },
    });
    return { completed: null, claimed };
  });
}

export async function provisionAccessRequest(requestId: number, input: ProvisioningActor) {
  const claim = await claimProvisioning(requestId, input);
  if (claim.completed) return resultFromRequest(claim.completed);

  try {
    const completed = await db.transaction(async (tx) => {
      const [request] = await tx.select().from(accessRequests).where(eq(accessRequests.id, requestId)).limit(1);
      if (!request) throw new ApiError(404, "ACCESS_REQUEST_NOT_FOUND", "Access request not found.");
      if (request.status === "provisioned") return request;
      if (request.status !== "provisioning" || request.provisioningIdempotencyKey !== input.idempotencyKey) {
        throw new ApiError(409, "PROVISIONING_CLAIM_LOST", "The provisioning claim is no longer active.");
      }
      validateProvisioningRequest(request);

      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await bcrypt.hash(temporaryPassword, 12);
      const [user] = await tx.insert(users).values({
        email: request.requesterEmail.trim().toLowerCase(),
        passwordHash,
        fullName: request.requesterName,
        status: "active",
        mustChangePassword: true,
        accountRole: request.assignedRole,
        provisioningRequestId: request.id,
      }).returning();

      let firm: typeof firms.$inferSelect | undefined;
      if (request.requestType === "firm") {
        [firm] = await tx.insert(firms).values({
          name: request.firmName!,
          subdomain: slugFor(request.firmName!, request.id),
          status: "active",
          provisioningRequestId: request.id,
        }).returning();
        await tx.insert(firmUsers).values({ userId: user.id, firmId: firm.id, role: "FIRM_OWNER" });
      }

      const initialCredits = request.requestType === "firm" ? env.FIRM_INITIAL_CREDITS : env.INDIVIDUAL_INITIAL_CREDITS;
      const [subscription] = await tx.insert(platformSubscriptions).values({
        firmId: firm?.id,
        userId: firm ? undefined : user.id,
        ownerType: request.requestType,
        accessRequestId: request.id,
        plan: request.requestType === "firm" ? "Core Firm" : "Core Individual",
        status: "Active",
        seatsAllocated: request.requestType === "firm" ? 5 : 1,
      }).returning();
      const [wallet] = await tx.insert(creditWallets).values({
        ownerType: request.requestType,
        firmId: firm?.id,
        userId: firm ? undefined : user.id,
        subscriptionId: subscription.id,
        accessRequestId: request.id,
        balance: initialCredits,
        lowBalanceThreshold: request.requestType === "firm" ? 1000 : 200,
        status: "active",
      }).returning();
      await tx.insert(creditLedger).values({
        walletId: wallet.id,
        firmId: firm?.id,
        entryType: "BONUS",
        amount: initialCredits,
        balanceAfter: initialCredits,
        idempotencyKey: `${input.idempotencyKey}:initial-credit`,
        referenceType: "access_request",
        referenceId: String(request.id),
        reason: "Initial credits allocated during approved access provisioning.",
        correlationId: input.correlationId,
        metadata: JSON.stringify({ allocation: "initial", ownerType: request.requestType }),
      });

      const rawActivationToken = crypto.randomBytes(32).toString("base64url");
      const tokenHash = crypto.createHash("sha256").update(rawActivationToken).digest("hex");
      const [activationToken] = await tx.insert(activationTokens).values({
        userId: user.id,
        accessRequestId: request.id,
        tokenHash,
        expiresAt: new Date(Date.now() + env.ACTIVATION_TOKEN_TTL_HOURS * 60 * 60 * 1000),
      }).returning();

      const provisionedAt = new Date();
      const [updated] = await tx.update(accessRequests).set({
        status: "provisioned",
        provisionedUserId: user.id,
        provisionedFirmId: firm?.id,
        subscriptionId: subscription.id,
        walletId: wallet.id,
        activationTokenId: activationToken.id,
        activationStatus: "pending_delivery",
        provisionedAt,
        provisioningError: null,
        updatedAt: provisionedAt,
      }).where(and(
        eq(accessRequests.id, request.id),
        eq(accessRequests.status, "provisioning"),
        eq(accessRequests.provisioningIdempotencyKey, input.idempotencyKey),
      )).returning();
      if (!updated) throw new ApiError(409, "PROVISIONING_CLAIM_LOST", "The provisioning claim was lost before completion.");

      await writeAuditEvent(tx, {
        actor: input.actor, actorUserId: input.actorId, actorRoleContext: input.actorPlatformRole,
        action: "ACCESS_REQUEST_PROVISIONED", targetTenantId: firm?.id, targetUserId: user.id,
        targetResourceType: "access_request", targetResourceId: request.id,
        previousState: "provisioning", newState: "provisioned", correlationId: input.correlationId,
        reason: "Approved access request provisioned", sourceApplication: "control",
        metadata: { subscriptionId: String(subscription.id), walletId: String(wallet.id), activationTokenRecordId: String(activationToken.id), initialCredits, idempotencyKey: input.idempotencyKey },
      });
      return updated;
    });
    return resultFromRequest(completed);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown provisioning failure";
    try {
      await db.transaction(async (tx) => {
        const failedAt = new Date();
        const [failed] = await tx.update(accessRequests).set({
          status: "failed",
          provisioningError: message,
          updatedAt: failedAt,
        }).where(and(
          eq(accessRequests.id, requestId),
          eq(accessRequests.status, "provisioning"),
          eq(accessRequests.provisioningIdempotencyKey, input.idempotencyKey),
        )).returning({ id: accessRequests.id });
        if (failed) {
          await writeAuditEvent(tx, {
            actor: input.actor, actorUserId: input.actorId, actorRoleContext: input.actorPlatformRole,
            action: "ACCESS_REQUEST_PROVISIONING_FAILED", severity: "error",
            targetResourceType: "access_request", targetResourceId: requestId,
            previousState: "provisioning", newState: "failed", correlationId: input.correlationId,
            reason: "Provisioning transaction failed", sourceApplication: "control",
            metadata: { idempotencyKey: input.idempotencyKey, error: message },
          });
        }
      });
    } catch (auditError) {
      console.error("Failed to persist provisioning failure state", auditError);
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "PROVISIONING_FAILED", "Provisioning failed atomically; no partial account records were committed. The request is retryable.");
  }
}
