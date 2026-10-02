import bcrypt from "bcrypt";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import { accessRequests, users } from "../db/schema";
import { ApiError } from "../middlewares/errorHandler";
import { sendTemporaryCredentialEmail } from "./email";
import { writeAuditEvent } from "./audit";
import { generateTemporaryPassword } from "./temporaryPassword";

const STALE_DELIVERY_MS = 5 * 60 * 1000;

export interface ActivationDeliveryActor {
  actor: string;
  actorId: string;
  actorPlatformRole: "PLATFORM_ADMIN" | "PLATFORM_MAINTAINER";
  correlationId: string;
  ipAddress?: string;
}

export async function deliverActivationForRequest(requestId: number, input: ActivationDeliveryActor) {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const staleBefore = new Date(Date.now() - STALE_DELIVERY_MS);

  const claim = await db.transaction(async (tx) => {
    const [request] = await tx.select().from(accessRequests).where(eq(accessRequests.id, requestId)).limit(1);
    if (!request) throw new ApiError(404, "ACCESS_REQUEST_NOT_FOUND", "Access request not found.");
    if (request.status !== "provisioned" || !request.provisionedUserId) {
      throw new ApiError(409, "ACTIVATION_DELIVERY_STATE_CONFLICT", "Credentials can only be delivered for a provisioned access request.");
    }

    const [user] = await tx.select().from(users).where(eq(users.id, request.provisionedUserId)).limit(1);
    if (!user) throw new ApiError(409, "PROVISIONED_USER_NOT_FOUND", "The provisioned user record is missing.");

    const availableClaim = or(
      isNull(accessRequests.activationStatus),
      eq(accessRequests.activationStatus, "delivery_failed"),
      eq(accessRequests.activationStatus, "delivered"),
      and(
        eq(accessRequests.activationStatus, "pending_delivery"),
        or(isNull(accessRequests.activationDeliveryStartedAt), lt(accessRequests.activationDeliveryStartedAt, staleBefore)),
      ),
    );
    const startedAt = new Date();
    const [claimed] = await tx.update(accessRequests).set({
      activationStatus: "pending_delivery",
      activationDeliveryAttempts: sql`${accessRequests.activationDeliveryAttempts} + 1`,
      activationDeliveryStartedAt: startedAt,
      activationDeliveryError: null,
      updatedAt: startedAt,
    }).where(and(eq(accessRequests.id, requestId), availableClaim)).returning();
    if (!claimed) throw new ApiError(409, "ACTIVATION_DELIVERY_IN_PROGRESS", "Activation delivery is already in progress.");

    const deliveryIdempotencyKey = `temporary-credential-delivery:${requestId}:${claimed.activationDeliveryAttempts}`;
    await tx.update(users).set({
      passwordHash,
      mustChangePassword: true,
      status: "active",
      updatedAt: startedAt,
    }).where(eq(users.id, user.id));

    await writeAuditEvent(tx, {
      actor: input.actor, actorUserId: input.actorId, actorRoleContext: input.actorPlatformRole,
      action: "TEMPORARY_CREDENTIAL_DELIVERY_STARTED", targetTenantId: request.provisionedFirmId, targetUserId: user.id,
      targetResourceType: "access_request", targetResourceId: requestId,
      previousState: request.activationStatus, newState: "pending_delivery", correlationId: input.correlationId,
      reason: "Temporary credential delivery started", sourceApplication: "core",
      metadata: { deliveryAttempt: claimed.activationDeliveryAttempts, ipAddress: input.ipAddress },
    });
    return { request: claimed, user, deliveryIdempotencyKey };
  });

  try {
    const providerResult = await sendTemporaryCredentialEmail({
      to: claim.user.email,
      recipientName: claim.user.fullName || claim.user.email,
      temporaryPassword,
      idempotencyKey: claim.deliveryIdempotencyKey,
    });
    const deliveredAt = new Date();
    await db.transaction(async (tx) => {
      const [updated] = await tx.update(accessRequests).set({
        activationStatus: "delivered",
        activationDeliveredAt: deliveredAt,
        activationDeliveryError: null,
        updatedAt: deliveredAt,
      }).where(and(
        eq(accessRequests.id, requestId),
        eq(accessRequests.activationStatus, "pending_delivery"),
        eq(accessRequests.activationDeliveryAttempts, claim.request.activationDeliveryAttempts),
      )).returning({ id: accessRequests.id });
      if (!updated) throw new ApiError(409, "ACTIVATION_DELIVERY_CLAIM_LOST", "The activation delivery claim was lost before completion.");
      await writeAuditEvent(tx, {
        actor: input.actor, actorUserId: input.actorId, actorRoleContext: input.actorPlatformRole,
        action: "TEMPORARY_CREDENTIAL_DELIVERED", targetTenantId: claim.request.provisionedFirmId, targetUserId: claim.user.id,
        targetResourceType: "access_request", targetResourceId: requestId,
        previousState: "pending_delivery", newState: "delivered", correlationId: input.correlationId,
        reason: "Temporary credential delivered", sourceApplication: "core",
        metadata: { deliveryAttempt: claim.request.activationDeliveryAttempts, provider: providerResult.provider, providerMessageId: providerResult.messageId },
      });
    });
    return {
      status: "delivered" as const,
      deliveredAt,
      attempts: claim.request.activationDeliveryAttempts,
      provider: providerResult.provider,
    };
  } catch (error) {
    const safeError = error instanceof ApiError ? error.message : "Activation email provider delivery failed.";
    try {
      await db.transaction(async (tx) => {
        const failedAt = new Date();
        const [failed] = await tx.update(accessRequests).set({
          activationStatus: "delivery_failed",
          activationDeliveryError: safeError.slice(0, 500),
          updatedAt: failedAt,
        }).where(and(
          eq(accessRequests.id, requestId),
          eq(accessRequests.activationStatus, "pending_delivery"),
          eq(accessRequests.activationDeliveryAttempts, claim.request.activationDeliveryAttempts),
        )).returning({ id: accessRequests.id });
        if (failed) {
          await writeAuditEvent(tx, {
            actor: input.actor, actorUserId: input.actorId, actorRoleContext: input.actorPlatformRole,
            action: "TEMPORARY_CREDENTIAL_DELIVERY_FAILED", severity: "error",
            targetTenantId: claim.request.provisionedFirmId, targetUserId: claim.user.id,
            targetResourceType: "access_request", targetResourceId: requestId,
            previousState: "pending_delivery", newState: "delivery_failed", correlationId: input.correlationId,
            reason: "Temporary credential delivery failed", sourceApplication: "core",
            metadata: { deliveryAttempt: claim.request.activationDeliveryAttempts, error: safeError.slice(0, 500) },
          });
        }
      });
    } catch (stateError) {
      console.error("Failed to persist activation delivery failure state", stateError);
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "ACTIVATION_DELIVERY_FAILED", "Account provisioning succeeded, but activation email delivery failed. Delivery can be retried safely.");
  }
}
