import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db";
import { creditLedger, creditWallets, rechargeRequests } from "../db/schema";
import { ApiError } from "../middlewares/errorHandler";
import { CreditOwnerContext, resolveWalletForUser } from "./creditAccounting";
import { writeAuditEvent } from "./audit";

export const RECHARGE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "FAILED"] as const;
export type RechargeStatus = typeof RECHARGE_STATUSES[number];

interface CreateRechargeInput extends CreditOwnerContext {
  creditsRequested: number;
  paymentReference: string;
  paymentMethod: string;
  requesterNote?: string;
  idempotencyKey: string;
}

interface ReviewRechargeInput {
  requestId: number;
  decision: "APPROVED" | "REJECTED";
  reason: string;
  actor: string;
  actorId: string;
  actorPlatformRole: "PLATFORM_ADMIN" | "PLATFORM_MAINTAINER";
  correlationId: string;
  idempotencyKey: string;
}

function textValue(value: string, code: string, label: string, min: number, max: number): string {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new ApiError(400, code, `${label} must contain ${min}-${max} characters.`);
  return normalized;
}

function positiveInteger(value: number, code: string, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ApiError(400, code, `${label} must be a positive integer.`);
}

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  return candidate?.code === "23505" || candidate?.cause?.code === "23505";
}

function requireRechargeManager(wallet: typeof creditWallets.$inferSelect, role: string | null): void {
  if (wallet.firmId && role !== "FIRM_OWNER" && role !== "PARTNER") {
    throw new ApiError(403, "RECHARGE_MANAGEMENT_FORBIDDEN", "Only a Firm Owner or Partner may manage firm recharge requests.");
  }
}

async function resultForRequest(executor: any, recharge: typeof rechargeRequests.$inferSelect) {
  const [wallet] = await executor.select().from(creditWallets).where(eq(creditWallets.id, recharge.walletId)).limit(1);
  if (!wallet) throw new ApiError(500, "CREDIT_WALLET_NOT_FOUND", "The recharge wallet no longer exists.");
  const ledgerEntry = recharge.ledgerEntryId
    ? (await executor.select().from(creditLedger).where(eq(creditLedger.id, recharge.ledgerEntryId)).limit(1))[0]
    : undefined;
  return {
    request: recharge,
    wallet,
    ledgerEntry,
    thresholdWarning: { isLow: wallet.balance <= wallet.lowBalanceThreshold, threshold: wallet.lowBalanceThreshold, balance: wallet.balance },
  };
}

export async function createRechargeRequest(input: CreateRechargeInput) {
  positiveInteger(input.creditsRequested, "INVALID_RECHARGE_CREDITS", "Requested credits");
  if (input.creditsRequested > 10_000_000) throw new ApiError(400, "INVALID_RECHARGE_CREDITS", "Requested credits cannot exceed 10000000.");
  const paymentReference = textValue(input.paymentReference, "INVALID_PAYMENT_REFERENCE", "Payment reference", 3, 200);
  const paymentMethod = textValue(input.paymentMethod, "INVALID_PAYMENT_METHOD", "Payment method", 2, 80);
  const idempotencyKey = textValue(input.idempotencyKey, "INVALID_IDEMPOTENCY_KEY", "Idempotency key", 8, 200);
  const requesterNote = input.requesterNote?.trim();
  if (requesterNote && requesterNote.length > 1000) throw new ApiError(400, "INVALID_RECHARGE_NOTE", "Recharge note must be 1000 characters or fewer.");

  try {
    return await db.transaction(async (tx) => {
      const { wallet, role } = await resolveWalletForUser(tx, input);
      requireRechargeManager(wallet, role);
      const [existing] = await tx.select().from(rechargeRequests).where(eq(rechargeRequests.idempotencyKey, idempotencyKey)).limit(1);
      if (existing) {
        if (existing.walletId !== wallet.id || existing.creditsRequested !== input.creditsRequested || existing.paymentReference !== paymentReference || existing.paymentMethod !== paymentMethod) {
          throw new ApiError(409, "RECHARGE_IDEMPOTENCY_CONFLICT", "The recharge idempotency key is already bound to different request details.");
        }
        return resultForRequest(tx, existing);
      }
      if (wallet.status !== "active") throw new ApiError(409, "CREDIT_WALLET_NOT_ACTIVE", "The credit wallet is not active.");
      const [created] = await tx.insert(rechargeRequests).values({
        walletId: wallet.id,
        subscriptionId: wallet.subscriptionId,
        ownerType: wallet.ownerType,
        userId: wallet.userId,
        firmId: wallet.firmId,
        requestedByUserId: input.userId,
        creditsRequested: input.creditsRequested,
        paymentReference,
        paymentMethod,
        requesterNote: requesterNote || undefined,
        idempotencyKey,
      }).returning();
      await writeAuditEvent(tx, {
        actor: `user:${input.userId}`, actorUserId: input.userId, actorRoleContext: role || "CORE_USER",
        action: "RECHARGE_REQUEST_CREATED", targetTenantId: wallet.firmId, targetUserId: input.userId,
        targetResourceType: "recharge_request", targetResourceId: created.id,
        previousState: "not_created", newState: "PENDING", correlationId: `recharge-create:${created.id}`,
        reason: requesterNote || "Recharge requested", sourceApplication: "core",
        metadata: { targetWalletId: String(wallet.id), creditsRequested: input.creditsRequested, paymentMethod, idempotencyKey },
      });
      return resultForRequest(tx, created);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const { wallet, role } = await resolveWalletForUser(db, input);
      requireRechargeManager(wallet, role);
      const [existing] = await db.select().from(rechargeRequests).where(eq(rechargeRequests.idempotencyKey, idempotencyKey)).limit(1);
      if (existing && existing.walletId === wallet.id && existing.creditsRequested === input.creditsRequested && existing.paymentReference === paymentReference && existing.paymentMethod === paymentMethod) return resultForRequest(db, existing);
      if (existing) throw new ApiError(409, "RECHARGE_IDEMPOTENCY_CONFLICT", "The recharge idempotency key is already bound to different request details.");
      throw new ApiError(409, "DUPLICATE_PAYMENT_REFERENCE", "This wallet already has a recharge request for the supplied payment reference.");
    }
    throw error;
  }
}

export async function listRechargeRequestsForUser(context: CreditOwnerContext, status?: RechargeStatus, limit = 100) {
  const { wallet, role } = await resolveWalletForUser(db, context);
  requireRechargeManager(wallet, role);
  const conditions = status ? and(eq(rechargeRequests.walletId, wallet.id), eq(rechargeRequests.status, status)) : eq(rechargeRequests.walletId, wallet.id);
  const requests = await db.select().from(rechargeRequests).where(conditions).orderBy(desc(rechargeRequests.createdAt)).limit(Math.max(1, Math.min(limit, 200)));
  return { wallet, requests, thresholdWarning: { isLow: wallet.balance <= wallet.lowBalanceThreshold, threshold: wallet.lowBalanceThreshold, balance: wallet.balance } };
}

export async function cancelRechargeRequest(context: CreditOwnerContext, requestId: number, reason: string) {
  positiveInteger(requestId, "INVALID_RECHARGE_REQUEST_ID", "Recharge request ID");
  const normalizedReason = textValue(reason, "RECHARGE_CANCELLATION_REASON_REQUIRED", "Cancellation reason", 3, 500);
  return db.transaction(async (tx) => {
    const { wallet, role } = await resolveWalletForUser(tx, context);
    requireRechargeManager(wallet, role);
    const [updated] = await tx.update(rechargeRequests).set({ status: "CANCELLED", cancelledAt: new Date(), cancellationReason: normalizedReason, updatedAt: new Date() })
      .where(and(eq(rechargeRequests.id, requestId), eq(rechargeRequests.walletId, wallet.id), eq(rechargeRequests.status, "PENDING"))).returning();
    if (!updated) {
      const [existing] = await tx.select().from(rechargeRequests).where(and(eq(rechargeRequests.id, requestId), eq(rechargeRequests.walletId, wallet.id))).limit(1);
      if (!existing) throw new ApiError(404, "RECHARGE_REQUEST_NOT_FOUND", "Recharge request not found.");
      throw new ApiError(409, "RECHARGE_STATE_CONFLICT", `Recharge request cannot be cancelled from '${existing.status}' state.`);
    }
    await writeAuditEvent(tx, {
      actor: `user:${context.userId}`, actorUserId: context.userId, actorRoleContext: role || "CORE_USER",
      action: "RECHARGE_REQUEST_CANCELLED", severity: "warning", targetTenantId: wallet.firmId, targetUserId: context.userId,
      targetResourceType: "recharge_request", targetResourceId: updated.id,
      previousState: "PENDING", newState: "CANCELLED", correlationId: `recharge-cancel:${updated.id}`,
      reason: normalizedReason, sourceApplication: "core", metadata: { targetWalletId: String(wallet.id) },
    });
    return resultForRequest(tx, updated);
  });
}

export async function listRechargeRequestsForControl(filters: { status?: RechargeStatus; search?: string; page?: number; limit?: number }) {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.max(1, Math.min(filters.limit || 50, 200));
  const search = filters.search?.trim();
  const predicate = and(
    filters.status ? eq(rechargeRequests.status, filters.status) : undefined,
    search ? or(ilike(rechargeRequests.paymentReference, `%${search}%`), ilike(rechargeRequests.paymentMethod, `%${search}%`)) : undefined,
  );
  const [requests, count] = await Promise.all([
    db.select().from(rechargeRequests).where(predicate).orderBy(desc(rechargeRequests.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select({ value: sql<number>`count(*)::int` }).from(rechargeRequests).where(predicate),
  ]);
  return { requests, total: Number(count[0]?.value || 0), page, limit };
}

export async function getRechargeRequestForControl(requestId: number) {
  positiveInteger(requestId, "INVALID_RECHARGE_REQUEST_ID", "Recharge request ID");
  const [recharge] = await db.select().from(rechargeRequests).where(eq(rechargeRequests.id, requestId)).limit(1);
  if (!recharge) throw new ApiError(404, "RECHARGE_REQUEST_NOT_FOUND", "Recharge request not found.");
  return resultForRequest(db, recharge);
}

export async function reviewRechargeRequest(input: ReviewRechargeInput) {
  positiveInteger(input.requestId, "INVALID_RECHARGE_REQUEST_ID", "Recharge request ID");
  const reason = textValue(input.reason, "RECHARGE_REVIEW_REASON_REQUIRED", "Review reason", 3, 500);
  const actor = textValue(input.actor, "INVALID_REVIEW_ACTOR", "Review actor", 1, 200);
  const actorId = textValue(input.actorId, "INVALID_REVIEW_ACTOR_ID", "Review actor ID", 1, 200);
  const correlationId = textValue(input.correlationId, "INVALID_CORRELATION_ID", "Correlation ID", 1, 200);
  const idempotencyKey = textValue(input.idempotencyKey, "INVALID_IDEMPOTENCY_KEY", "Idempotency key", 8, 200);

  return db.transaction(async (tx) => {
    const [recharge] = await tx.select().from(rechargeRequests).where(eq(rechargeRequests.id, input.requestId)).for("update").limit(1);
    if (!recharge) throw new ApiError(404, "RECHARGE_REQUEST_NOT_FOUND", "Recharge request not found.");
    if (recharge.reviewIdempotencyKey === idempotencyKey) {
      if (recharge.status !== input.decision || recharge.reviewReason !== reason || recharge.reviewedById !== actorId) throw new ApiError(409, "RECHARGE_IDEMPOTENCY_CONFLICT", "The review idempotency key is already bound to different review details.");
      return resultForRequest(tx, recharge);
    }
    if (recharge.status !== "PENDING") throw new ApiError(409, "RECHARGE_ALREADY_REVIEWED", `Recharge request was already finalized as '${recharge.status}'.`);

    let wallet = (await tx.select().from(creditWallets).where(eq(creditWallets.id, recharge.walletId)).for("update").limit(1))[0];
    if (!wallet) throw new ApiError(409, "CREDIT_WALLET_NOT_FOUND", "The recharge wallet no longer exists.");
    if (wallet.status !== "active") throw new ApiError(409, "CREDIT_WALLET_NOT_ACTIVE", "The credit wallet is not active.");
    let ledgerEntryId: number | undefined;
    const previousBalance = wallet.balance;
    if (input.decision === "APPROVED") {
      [wallet] = await tx.update(creditWallets).set({ balance: sql`${creditWallets.balance} + ${recharge.creditsRequested}`, updatedAt: new Date() }).where(eq(creditWallets.id, wallet.id)).returning();
      const [ledgerEntry] = await tx.insert(creditLedger).values({ walletId: wallet.id, firmId: wallet.firmId, entryType: "PURCHASE", amount: recharge.creditsRequested, balanceAfter: wallet.balance, idempotencyKey: `recharge-request:${recharge.id}:credit`, referenceType: "recharge_request", referenceId: String(recharge.id), reason: `Approved recharge: ${reason}`, correlationId, metadata: JSON.stringify({ paymentMethod: recharge.paymentMethod }) }).returning();
      ledgerEntryId = ledgerEntry.id;
    }
    const now = new Date();
    const [updated] = await tx.update(rechargeRequests).set({ status: input.decision, reviewedById: actorId, reviewedByName: actor, reviewerPlatformRole: input.actorPlatformRole, reviewReason: reason, reviewCorrelationId: correlationId, reviewIdempotencyKey: idempotencyKey, reviewedAt: now, ledgerEntryId, updatedAt: now }).where(and(eq(rechargeRequests.id, recharge.id), eq(rechargeRequests.status, "PENDING"))).returning();
    if (!updated) throw new ApiError(409, "RECHARGE_ALREADY_REVIEWED", "Recharge request was finalized concurrently.");
    await writeAuditEvent(tx, {
      actor, actorUserId: actorId, actorRoleContext: input.actorPlatformRole,
      action: input.decision === "APPROVED" ? "RECHARGE_REQUEST_APPROVED" : "RECHARGE_REQUEST_REJECTED",
      severity: input.decision === "APPROVED" ? "info" : "warning", targetTenantId: wallet.firmId, targetUserId: wallet.userId,
      targetResourceType: "recharge_request", targetResourceId: updated.id,
      previousState: "PENDING", newState: input.decision, correlationId, reason, sourceApplication: "control",
      metadata: { targetWalletId: String(wallet.id), creditsRequested: recharge.creditsRequested, previousBalance, newBalance: wallet.balance, idempotencyKey },
    });
    return resultForRequest(tx, updated);
  });
}
