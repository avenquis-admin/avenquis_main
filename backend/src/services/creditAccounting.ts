import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  creditLedger,
  creditWallets,
  firmUsers,
  firms,
  platformSubscriptions,
  usageEvents,
  users,
} from "../db/schema";
import { ApiError } from "../middlewares/errorHandler";
import { writeAuditEvent } from "./audit";

export const LEDGER_ENTRY_TYPES = ["PURCHASE", "USAGE", "BONUS", "ADJUSTMENT", "REFUND", "EXPIRY"] as const;
export type LedgerEntryType = typeof LEDGER_ENTRY_TYPES[number];

export interface CreditOwnerContext {
  userId: number;
  firmId?: number;
}

export interface ConsumeCreditsInput extends CreditOwnerContext {
  service: string;
  units: number;
  credits: number;
  idempotencyKey: string;
  correlationId: string;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface AdjustCreditsInput {
  walletId: number;
  amount: number;
  reason: string;
  idempotencyKey: string;
  correlationId: string;
  actor: string;
  actorId: string;
  actorPlatformRole: "PLATFORM_ADMIN" | "PLATFORM_MAINTAINER";
  metadata?: Record<string, unknown>;
}

function safeMetadata(value?: Record<string, unknown>): string | undefined {
  if (!value) return undefined;
  const serialized = JSON.stringify(value);
  if (serialized.length > 4000) throw new ApiError(400, "CREDIT_METADATA_TOO_LARGE", "Credit metadata must be 4000 characters or fewer.");
  return serialized;
}

function validatePositiveInteger(value: number, code: string, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ApiError(400, code, `${label} must be a positive integer.`);
}

function validateContractText(value: string, code: string, label: string, min: number, max: number): string {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new ApiError(400, code, `${label} must contain ${min}-${max} characters.`);
  return normalized;
}

export async function resolveWalletForUser(executor: any, context: CreditOwnerContext) {
  const [user] = await executor.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, context.userId)).limit(1);
  if (!user || user.status !== "active") throw new ApiError(403, "ACCOUNT_NOT_ACTIVE", "The account is not active.");

  if (context.firmId !== undefined) {
    const [membership] = await executor.select({ role: firmUsers.role, membershipStatus: firmUsers.status, firmStatus: firms.status })
      .from(firmUsers)
      .innerJoin(firms, eq(firmUsers.firmId, firms.id))
      .where(and(eq(firmUsers.userId, context.userId), eq(firmUsers.firmId, context.firmId)))
      .limit(1);
    if (!membership) throw new ApiError(403, "CREDIT_WALLET_FORBIDDEN", "The user is not a member of this firm.");
    if (membership.membershipStatus !== "active") throw new ApiError(403, "MEMBERSHIP_REVOKED", "The user's access to this firm has been revoked.");
    if (membership.firmStatus !== "active") throw new ApiError(403, "FIRM_SUSPENDED", "Firm access is suspended.");
    if (membership.role === "CLIENT") throw new ApiError(403, "CREDIT_CONSUMPTION_FORBIDDEN", "Client portal users cannot consume the firm's shared credits.");
    const [wallet] = await executor.select().from(creditWallets).where(eq(creditWallets.firmId, context.firmId)).limit(1);
    if (!wallet) throw new ApiError(404, "CREDIT_WALLET_NOT_FOUND", "No firm credit wallet was found.");
    return { wallet, role: membership.role };
  }

  const [wallet] = await executor.select().from(creditWallets).where(eq(creditWallets.userId, context.userId)).limit(1);
  if (!wallet) throw new ApiError(404, "CREDIT_WALLET_NOT_FOUND", "No individual credit wallet was found. Firm members must select a firm.");
  return { wallet, role: null };
}

async function reconciliationForWallet(executor: any, wallet: typeof creditWallets.$inferSelect) {
  const [sum] = await executor.select({ value: sql<number>`coalesce(sum(${creditLedger.amount}), 0)::int` })
    .from(creditLedger)
    .where(eq(creditLedger.walletId, wallet.id));
  const ledgerBalance = Number(sum?.value || 0);
  return { walletBalance: wallet.balance, ledgerBalance, matches: wallet.balance === ledgerBalance };
}

async function usageResult(executor: any, event: typeof usageEvents.$inferSelect) {
  const [wallet] = await executor.select().from(creditWallets).where(eq(creditWallets.id, event.walletId)).limit(1);
  if (!wallet) throw new ApiError(500, "CREDIT_WALLET_NOT_FOUND", "The usage event wallet no longer exists.");
  return { usageEvent: event, wallet, reconciliation: await reconciliationForWallet(executor, wallet) };
}

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate?.code === "23505" || candidate?.cause?.code === "23505";
}

export async function consumeCredits(input: ConsumeCreditsInput) {
  validatePositiveInteger(input.units, "INVALID_USAGE_UNITS", "Usage units");
  validatePositiveInteger(input.credits, "INVALID_CREDIT_CHARGE", "Credit charge");
  const service = validateContractText(input.service, "INVALID_USAGE_SERVICE", "Usage service", 2, 120);
  const reason = validateContractText(input.reason, "INVALID_USAGE_REASON", "Usage reason", 3, 500);
  const idempotencyKey = validateContractText(input.idempotencyKey, "INVALID_IDEMPOTENCY_KEY", "Idempotency key", 8, 200);
  const correlationId = validateContractText(input.correlationId, "INVALID_CORRELATION_ID", "Correlation ID", 1, 200);
  const metadata = safeMetadata(input.metadata);

  try {
    return await db.transaction(async (tx) => {
      const { wallet, role } = await resolveWalletForUser(tx, input);
      const [existing] = await tx.select().from(usageEvents).where(eq(usageEvents.idempotencyKey, idempotencyKey)).limit(1);
      if (existing) {
        if (existing.walletId !== wallet.id || existing.userId !== input.userId || existing.service !== service || existing.units !== input.units || existing.creditsCharged !== input.credits) {
          throw new ApiError(409, "CREDIT_IDEMPOTENCY_CONFLICT", "The usage idempotency key is already bound to different usage details.");
        }
        return usageResult(tx, existing);
      }
      if (wallet.status !== "active") throw new ApiError(409, "CREDIT_WALLET_NOT_ACTIVE", "The credit wallet is not active.");

      const [updatedWallet] = await tx.update(creditWallets).set({
        balance: sql`${creditWallets.balance} - ${input.credits}`,
        updatedAt: new Date(),
      }).where(and(
        eq(creditWallets.id, wallet.id),
        eq(creditWallets.status, "active"),
        gte(creditWallets.balance, input.credits),
      )).returning();
      if (!updatedWallet) throw new ApiError(402, "INSUFFICIENT_CREDIT_BALANCE", "The wallet does not have enough credits for this usage.");

      const [usageEvent] = await tx.insert(usageEvents).values({
        walletId: wallet.id,
        subscriptionId: wallet.subscriptionId,
        userId: input.userId,
        firmId: wallet.firmId,
        service,
        units: input.units,
        creditsCharged: input.credits,
        idempotencyKey,
        correlationId,
        metadata,
      }).returning();
      await tx.insert(creditLedger).values({
        walletId: wallet.id,
        usageEventId: usageEvent.id,
        actorUserId: input.userId,
        firmId: wallet.firmId,
        entryType: "USAGE",
        amount: -input.credits,
        balanceAfter: updatedWallet.balance,
        idempotencyKey: `usage:${idempotencyKey}`,
        referenceType: "usage_event",
        referenceId: String(usageEvent.id),
        reason,
        correlationId,
        metadata,
      });
      await writeAuditEvent(tx, {
        actor: `user:${input.userId}`, actorUserId: input.userId, actorRoleContext: role || "CORE_USER",
        action: "CREDITS_CONSUMED", targetTenantId: wallet.firmId, targetUserId: input.userId,
        targetResourceType: "credit_wallet", targetResourceId: wallet.id,
        previousState: String(wallet.balance), newState: String(updatedWallet.balance), correlationId,
        reason, sourceApplication: "core",
        metadata: { targetUsageEventId: String(usageEvent.id), service, units: input.units, credits: input.credits, idempotencyKey },
      });
      return usageResult(tx, usageEvent);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const [existing] = await db.select().from(usageEvents).where(eq(usageEvents.idempotencyKey, idempotencyKey)).limit(1);
      if (existing && existing.userId === input.userId && existing.service === service && existing.units === input.units && existing.creditsCharged === input.credits) {
        return usageResult(db, existing);
      }
      throw new ApiError(409, "CREDIT_IDEMPOTENCY_CONFLICT", "The usage idempotency key is already bound to different usage details.");
    }
    throw error;
  }
}

export async function adjustCredits(input: AdjustCreditsInput) {
  if (!Number.isSafeInteger(input.amount) || input.amount === 0) throw new ApiError(400, "INVALID_CREDIT_ADJUSTMENT", "Adjustment amount must be a non-zero integer.");
  const reason = validateContractText(input.reason, "CREDIT_ADJUSTMENT_REASON_REQUIRED", "Adjustment reason", 3, 500);
  const idempotencyKey = validateContractText(input.idempotencyKey, "INVALID_IDEMPOTENCY_KEY", "Idempotency key", 8, 200);
  const correlationId = validateContractText(input.correlationId, "INVALID_CORRELATION_ID", "Correlation ID", 1, 200);
  const metadata = safeMetadata(input.metadata);

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(creditLedger).where(eq(creditLedger.idempotencyKey, idempotencyKey)).limit(1);
    if (existing) {
      if (existing.walletId !== input.walletId || existing.entryType !== "ADJUSTMENT" || existing.amount !== input.amount || existing.reason !== reason) {
        throw new ApiError(409, "CREDIT_IDEMPOTENCY_CONFLICT", "The adjustment idempotency key is already bound to different details.");
      }
      const [wallet] = await tx.select().from(creditWallets).where(eq(creditWallets.id, input.walletId)).limit(1);
      return { ledgerEntry: existing, wallet, reconciliation: wallet ? await reconciliationForWallet(tx, wallet) : undefined };
    }

    const [current] = await tx.select().from(creditWallets).where(eq(creditWallets.id, input.walletId)).limit(1);
    if (!current) throw new ApiError(404, "CREDIT_WALLET_NOT_FOUND", "Credit wallet not found.");
    if (current.status !== "active") throw new ApiError(409, "CREDIT_WALLET_NOT_ACTIVE", "The credit wallet is not active.");
    const [wallet] = await tx.update(creditWallets).set({
      balance: sql`${creditWallets.balance} + ${input.amount}`,
      updatedAt: new Date(),
    }).where(and(
      eq(creditWallets.id, input.walletId),
      eq(creditWallets.status, "active"),
      gte(sql`${creditWallets.balance} + ${input.amount}`, 0),
    )).returning();
    if (!wallet) throw new ApiError(409, "CREDIT_ADJUSTMENT_NEGATIVE_BALANCE", "The adjustment would make the wallet balance negative.");

    const [ledgerEntry] = await tx.insert(creditLedger).values({
      walletId: wallet.id,
      firmId: wallet.firmId,
      entryType: "ADJUSTMENT",
      amount: input.amount,
      balanceAfter: wallet.balance,
      idempotencyKey,
      referenceType: "control_adjustment",
      referenceId: input.actorId,
      reason,
      correlationId,
      metadata,
    }).returning();
    await writeAuditEvent(tx, {
      actor: input.actor, actorUserId: input.actorId, actorRoleContext: input.actorPlatformRole,
      action: "CREDIT_BALANCE_ADJUSTED", severity: "warning",
      targetTenantId: wallet.firmId, targetUserId: wallet.userId,
      targetResourceType: "credit_wallet", targetResourceId: wallet.id,
      previousState: String(current.balance), newState: String(wallet.balance), correlationId,
      reason, sourceApplication: "control", metadata: { amount: input.amount, idempotencyKey },
    });
    return { ledgerEntry, wallet, reconciliation: await reconciliationForWallet(tx, wallet) };
  });
}

async function walletSnapshot(executor: any, wallet: typeof creditWallets.$inferSelect) {
  const [subscription] = await executor.select().from(platformSubscriptions).where(eq(platformSubscriptions.id, wallet.subscriptionId)).limit(1);
  return {
    wallet,
    subscription,
    reconciliation: await reconciliationForWallet(executor, wallet),
    thresholdWarning: {
      isLow: wallet.balance <= wallet.lowBalanceThreshold,
      threshold: wallet.lowBalanceThreshold,
      balance: wallet.balance,
    },
  };
}

export async function getWalletSnapshotForUser(context: CreditOwnerContext) {
  const { wallet, role } = await resolveWalletForUser(db, context);
  return { ...(await walletSnapshot(db, wallet)), canInspectUsage: !wallet.firmId || role === "FIRM_OWNER" || role === "PARTNER" };
}

export async function getWalletActivityForUser(context: CreditOwnerContext, limit = 100) {
  const { wallet, role } = await resolveWalletForUser(db, context);
  if (wallet.firmId && role !== "FIRM_OWNER" && role !== "PARTNER") {
    throw new ApiError(403, "CREDIT_USAGE_INSPECTION_FORBIDDEN", "Only a Firm Owner or Partner may inspect firm credit usage.");
  }
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const [ledger, usage] = await Promise.all([
    db.select().from(creditLedger).where(eq(creditLedger.walletId, wallet.id)).orderBy(desc(creditLedger.createdAt)).limit(safeLimit),
    db.select().from(usageEvents).where(eq(usageEvents.walletId, wallet.id)).orderBy(desc(usageEvents.createdAt)).limit(safeLimit),
  ]);
  return { ...(await walletSnapshot(db, wallet)), ledger, usage };
}

export async function getWalletForControl(walletId: number, limit = 100) {
  validatePositiveInteger(walletId, "INVALID_CREDIT_WALLET_ID", "Wallet ID");
  const [wallet] = await db.select().from(creditWallets).where(eq(creditWallets.id, walletId)).limit(1);
  if (!wallet) throw new ApiError(404, "CREDIT_WALLET_NOT_FOUND", "Credit wallet not found.");
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const [ledger, usage] = await Promise.all([
    db.select().from(creditLedger).where(eq(creditLedger.walletId, wallet.id)).orderBy(desc(creditLedger.createdAt)).limit(safeLimit),
    db.select().from(usageEvents).where(eq(usageEvents.walletId, wallet.id)).orderBy(desc(usageEvents.createdAt)).limit(safeLimit),
  ]);
  return { ...(await walletSnapshot(db, wallet)), ledger, usage };
}
