import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db";
import { firmUsers, firms, platformSubscriptions, users } from "../db/schema";
import { ApiError } from "../middlewares/errorHandler";
import { writeAuditEvent } from "./audit";

export interface GovernanceActor {
  actor: string;
  actorId: string;
  actorPlatformRole: "PLATFORM_ADMIN" | "PLATFORM_MAINTAINER";
  reason: string;
  correlationId: string;
}

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ApiError(400, "INVALID_GOVERNANCE_ID", `${label} must be a positive integer.`);
  return value;
}

function contractText(value: string, code: string, label: string, min = 1, max = 500): string {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new ApiError(400, code, `${label} must contain ${min}-${max} characters.`);
  return normalized;
}

function actorValues(input: GovernanceActor) {
  return {
    actor: contractText(input.actor, "INVALID_GOVERNANCE_ACTOR", "Actor", 1, 200),
    actorId: contractText(input.actorId, "INVALID_GOVERNANCE_ACTOR_ID", "Actor ID", 1, 200),
    reason: contractText(input.reason, "GOVERNANCE_REASON_REQUIRED", "Governance reason", 3, 500),
    correlationId: contractText(input.correlationId, "INVALID_CORRELATION_ID", "Correlation ID", 1, 200),
  };
}

function requireGovernanceAdmin(input: GovernanceActor) {
  if (input.actorPlatformRole !== "PLATFORM_ADMIN") {
    throw new ApiError(403, "GOVERNANCE_WRITE_FORBIDDEN", "Platform Admin role is required for governance changes.");
  }
  return actorValues(input);
}

async function insertAudit(tx: any, input: GovernanceActor, action: string, details: Record<string, unknown>, severity = "warning") {
  const actor = actorValues(input);
  await writeAuditEvent(tx, {
    actor: actor.actor, actorUserId: actor.actorId, actorRoleContext: input.actorPlatformRole,
    action, severity: severity as "info" | "warning",
    targetTenantId: details.targetFirmId as string | undefined,
    targetUserId: details.targetUserId as string | undefined,
    targetResourceType: action === "FIRM_ACCESS_REVOKED" ? "firm_membership" : details.targetUserId ? "user" : "firm",
    targetResourceId: String(details.targetUserId || details.targetFirmId),
    previousState: details.previousState as string | undefined,
    newState: details.newState as string | undefined,
    correlationId: actor.correlationId, reason: actor.reason, sourceApplication: "control",
    metadata: details,
  });
}

function firmRecord(firm: typeof firms.$inferSelect, memberCount = 0, subscription?: typeof platformSubscriptions.$inferSelect) {
  return {
    id: String(firm.id), name: firm.name, subdomain: firm.subdomain, status: firm.status,
    usersCount: memberCount, seatsAllocated: subscription?.seatsAllocated || Math.max(memberCount, 1), seatsActive: memberCount,
    subscriptionStatus: subscription?.status || "Unassigned", plan: subscription?.plan || "Unassigned",
    primaryContact: "Core governance", mrr: subscription?.amount || "0.00",
    onboardedDate: firm.createdAt.toISOString(), createdAt: firm.createdAt.toISOString(), aiEnabled: false,
    country: "Bangladesh", firmType: "Chartered Accountants",
  };
}

export async function listGovernanceFirms(filters: { search?: string; status?: string; page?: number; limit?: number }) {
  const page = Math.max(1, filters.page || 1); const limit = Math.max(1, Math.min(filters.limit || 50, 200));
  const predicate = and(
    filters.status && filters.status !== "all" ? eq(firms.status, filters.status) : undefined,
    filters.search ? or(ilike(firms.name, `%${filters.search.trim()}%`), ilike(firms.subdomain, `%${filters.search.trim()}%`)) : undefined,
  );
  const rows = await db.select({ firm: firms, members: count(firmUsers.userId), subscription: platformSubscriptions })
    .from(firms).leftJoin(firmUsers, eq(firmUsers.firmId, firms.id)).leftJoin(platformSubscriptions, eq(platformSubscriptions.firmId, firms.id))
    .where(predicate).groupBy(firms.id, platformSubscriptions.id).orderBy(desc(firms.createdAt)).limit(limit).offset((page - 1) * limit);
  const [total] = await db.select({ value: sql<number>`count(*)::int` }).from(firms).where(predicate);
  return { data: rows.map((row) => firmRecord(row.firm, Number(row.members), row.subscription || undefined)), total: Number(total?.value || 0), page, limit };
}

export async function getGovernanceFirm(firmId: number) {
  positiveId(firmId, "Firm ID");
  const [firm] = await db.select().from(firms).where(eq(firms.id, firmId)).limit(1);
  if (!firm) throw new ApiError(404, "FIRM_NOT_FOUND", "Firm not found.");
  const [[members], [subscription]] = await Promise.all([
    db.select({ value: count() }).from(firmUsers).where(and(eq(firmUsers.firmId, firmId), eq(firmUsers.status, "active"))),
    db.select().from(platformSubscriptions).where(eq(platformSubscriptions.firmId, firmId)).limit(1),
  ]);
  return firmRecord(firm, Number(members?.value || 0), subscription);
}

export async function listGovernanceFirmMembers(firmId: number) {
  positiveId(firmId, "Firm ID");
  await getGovernanceFirm(firmId);
  return db.select({ id: users.id, name: users.fullName, email: users.email, role: firmUsers.role, membershipStatus: firmUsers.status, accountStatus: users.status, createdAt: firmUsers.createdAt })
    .from(firmUsers).innerJoin(users, eq(users.id, firmUsers.userId)).where(eq(firmUsers.firmId, firmId)).orderBy(asc(users.email));
}

export async function transitionFirm(firmId: number, transition: "activate" | "suspend" | "reactivate", input: GovernanceActor) {
  positiveId(firmId, "Firm ID"); requireGovernanceAdmin(input);
  const expected = transition === "activate" ? "pending_activation" : transition === "suspend" ? "active" : "suspended";
  const target = transition === "suspend" ? "suspended" : "active";
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(firms).where(eq(firms.id, firmId)).for("update").limit(1);
    if (!current) throw new ApiError(404, "FIRM_NOT_FOUND", "Firm not found.");
    if (current.status !== expected) throw new ApiError(409, "FIRM_STATE_CONFLICT", `Firm cannot ${transition} from '${current.status}' state.`);
    const [updated] = await tx.update(firms).set({ status: target, updatedAt: new Date() }).where(and(eq(firms.id, firmId), eq(firms.status, expected))).returning();
    if (!updated) throw new ApiError(409, "FIRM_STATE_CONFLICT", "Firm state changed concurrently.");
    await insertAudit(tx, input, transition === "suspend" ? "FIRM_SUSPENDED" : transition === "activate" ? "FIRM_ACTIVATED" : "FIRM_REACTIVATED", { targetFirmId: String(firmId), previousState: current.status, newState: updated.status }, transition === "suspend" ? "warning" : "info");
    const [[members], [subscription]] = await Promise.all([
      tx.select({ value: count() }).from(firmUsers).where(and(eq(firmUsers.firmId, updated.id), eq(firmUsers.status, "active"))),
      tx.select().from(platformSubscriptions).where(eq(platformSubscriptions.firmId, updated.id)).limit(1),
    ]);
    return firmRecord(updated, Number(members?.value || 0), subscription);
  });
}

function userRecord(row: { user: typeof users.$inferSelect; membership: typeof firmUsers.$inferSelect | null; firm: typeof firms.$inferSelect | null }) {
  return {
    id: String(row.user.id), fullName: row.user.fullName || row.user.email.split("@")[0], email: row.user.email,
    firm: row.firm?.name || "Unassigned", firmId: row.firm ? String(row.firm.id) : undefined,
    role: row.membership?.role || row.user.accountRole || row.user.platformRole || "Member",
    membershipStatus: row.membership?.status === "revoked" ? "Revoked" : row.membership ? "Active" : "Unassigned",
    accountStatus: row.user.status === "active" ? "Verified" : row.user.status === "disabled" ? "Disabled" : "Inactive",
    status: row.user.status, mfaEnabled: false, lastActive: row.user.updatedAt.toISOString(), createdAt: row.user.createdAt.toISOString(), updatedAt: row.user.updatedAt.toISOString(),
  };
}

export async function listGovernanceUsers(filters: { search?: string; status?: string; role?: string; firmId?: number; page?: number; limit?: number }) {
  const page = Math.max(1, filters.page || 1); const limit = Math.max(1, Math.min(filters.limit || 50, 200));
  const predicate = and(
    filters.status && filters.status !== "all" ? eq(users.status, filters.status) : undefined,
    filters.role && filters.role !== "all" ? eq(firmUsers.role, filters.role as any) : undefined,
    filters.firmId ? eq(firmUsers.firmId, filters.firmId) : undefined,
    filters.search ? or(ilike(users.email, `%${filters.search.trim()}%`), ilike(users.fullName, `%${filters.search.trim()}%`)) : undefined,
  );
  const rows = await db.select({ user: users, membership: firmUsers, firm: firms }).from(users)
    .leftJoin(firmUsers, eq(firmUsers.userId, users.id)).leftJoin(firms, eq(firms.id, firmUsers.firmId))
    .where(predicate).orderBy(desc(users.createdAt)).limit(limit).offset((page - 1) * limit);
  const [total] = await db.select({ value: sql<number>`count(distinct ${users.id})::int` }).from(users).leftJoin(firmUsers, eq(firmUsers.userId, users.id)).where(predicate);
  return { data: rows.map(userRecord), total: Number(total?.value || 0), page, limit };
}

export async function getGovernanceUser(userId: number) {
  positiveId(userId, "User ID");
  const [row] = await db.select({ user: users, membership: firmUsers, firm: firms }).from(users)
    .leftJoin(firmUsers, eq(firmUsers.userId, users.id)).leftJoin(firms, eq(firms.id, firmUsers.firmId)).where(eq(users.id, userId)).limit(1);
  if (!row) throw new ApiError(404, "USER_NOT_FOUND", "User not found.");
  return userRecord(row);
}

export async function transitionUser(userId: number, transition: "enable" | "disable", input: GovernanceActor) {
  positiveId(userId, "User ID"); requireGovernanceAdmin(input);
  const expected = transition === "disable" ? "active" : "disabled"; const target = transition === "disable" ? "disabled" : "active";
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(users).where(eq(users.id, userId)).for("update").limit(1);
    if (!current) throw new ApiError(404, "USER_NOT_FOUND", "User not found.");
    if (current.status !== expected) throw new ApiError(409, "USER_STATE_CONFLICT", `User cannot ${transition} from '${current.status}' state.`);
    const [updated] = await tx.update(users).set({ status: target, updatedAt: new Date() }).where(and(eq(users.id, userId), eq(users.status, expected))).returning();
    if (!updated) throw new ApiError(409, "USER_STATE_CONFLICT", "User state changed concurrently.");
    await insertAudit(tx, input, transition === "disable" ? "USER_DISABLED" : "USER_ENABLED", { targetUserId: String(userId), previousState: current.status, newState: updated.status }, transition === "disable" ? "warning" : "info");
    const [row] = await tx.select({ user: users, membership: firmUsers, firm: firms }).from(users)
      .leftJoin(firmUsers, eq(firmUsers.userId, users.id)).leftJoin(firms, eq(firms.id, firmUsers.firmId)).where(eq(users.id, updated.id)).limit(1);
    return userRecord(row);
  });
}

export async function revokeFirmAccess(userId: number, firmId: number, input: GovernanceActor) {
  positiveId(userId, "User ID"); positiveId(firmId, "Firm ID"); requireGovernanceAdmin(input);
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(firmUsers).where(and(eq(firmUsers.userId, userId), eq(firmUsers.firmId, firmId))).for("update").limit(1);
    if (!current) throw new ApiError(404, "FIRM_MEMBERSHIP_NOT_FOUND", "Firm membership not found.");
    if (current.status !== "active") throw new ApiError(409, "MEMBERSHIP_STATE_CONFLICT", `Firm membership cannot be revoked from '${current.status}' state.`);
    const actor = actorValues(input); const now = new Date();
    const [updated] = await tx.update(firmUsers).set({ status: "revoked", revokedAt: now, revokedReason: actor.reason, updatedAt: now }).where(and(eq(firmUsers.userId, userId), eq(firmUsers.firmId, firmId), eq(firmUsers.status, "active"))).returning();
    if (!updated) throw new ApiError(409, "MEMBERSHIP_STATE_CONFLICT", "Firm membership changed concurrently.");
    await insertAudit(tx, input, "FIRM_ACCESS_REVOKED", { targetUserId: String(userId), targetFirmId: String(firmId), previousState: current.status, newState: updated.status });
    return { userId: updated.userId, firmId: updated.firmId, role: updated.role, status: updated.status, revokedAt: updated.revokedAt, revokedReason: updated.revokedReason };
  });
}
