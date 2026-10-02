import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../db";
import { auditEvents } from "../db/schema";
import { ApiError } from "../middlewares/errorHandler";

export type AuditSourceApplication = "core" | "control";

export interface StandardAuditEvent {
  actor: string;
  actorUserId?: string | number | null;
  actorRoleContext?: string | null;
  action: string;
  severity?: "info" | "warning" | "error" | "security";
  targetTenantId?: string | number | null;
  targetUserId?: string | number | null;
  targetResourceType: string;
  targetResourceId: string | number;
  previousState?: string | null;
  newState?: string | null;
  correlationId: string;
  reason?: string | null;
  sourceApplication: AuditSourceApplication;
  metadata?: Record<string, unknown>;
}

const forbiddenAuditKey = /password|raw.?token|access.?token|refresh.?token|authorization|cookie|secret|api.?key/i;

function assertSecretSafe(value: unknown, path = "metadata"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSecretSafe(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenAuditKey.test(key)) throw new ApiError(500, "UNSAFE_AUDIT_METADATA", `Audit metadata field '${path}.${key}' is not permitted.`);
    assertSecretSafe(child, `${path}.${key}`);
  }
}

function text(value: string | number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

export async function writeAuditEvent(executor: any, event: StandardAuditEvent) {
  assertSecretSafe(event.metadata);
  const structuredDetails = {
    actorUserId: text(event.actorUserId),
    actorRoleContext: event.actorRoleContext || null,
    targetTenantId: text(event.targetTenantId),
    targetUserId: text(event.targetUserId),
    targetResourceType: event.targetResourceType,
    targetResourceId: String(event.targetResourceId),
    previousState: event.previousState || null,
    newState: event.newState || null,
    correlationId: event.correlationId,
    reason: event.reason || null,
    sourceApplication: event.sourceApplication,
    metadata: event.metadata || {},
  };
  const [created] = await executor.insert(auditEvents).values({
    actor: event.actor,
    actorUserId: text(event.actorUserId),
    actorRoleContext: event.actorRoleContext || null,
    action: event.action,
    severity: event.severity || "info",
    targetTenantId: text(event.targetTenantId),
    targetUserId: text(event.targetUserId),
    targetResourceType: event.targetResourceType,
    targetResourceId: String(event.targetResourceId),
    previousState: event.previousState || null,
    newState: event.newState || null,
    correlationId: event.correlationId,
    reason: event.reason || null,
    sourceApplication: event.sourceApplication,
    details: JSON.stringify(structuredDetails),
  }).returning();
  return created;
}

export interface AuditQuery {
  action?: string;
  sourceApplication?: AuditSourceApplication;
  targetTenantId?: string;
  correlationId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listAuditEvents(query: AuditQuery = {}) {
  const page = Math.max(1, query.page || 1);
  const limit = Math.max(1, Math.min(query.limit || 50, 200));
  const search = query.search?.trim();
  const predicate = and(
    query.action ? eq(auditEvents.action, query.action) : undefined,
    query.sourceApplication ? eq(auditEvents.sourceApplication, query.sourceApplication) : undefined,
    query.targetTenantId ? eq(auditEvents.targetTenantId, query.targetTenantId) : undefined,
    query.correlationId ? eq(auditEvents.correlationId, query.correlationId) : undefined,
    search ? or(ilike(auditEvents.actor, `%${search}%`), ilike(auditEvents.action, `%${search}%`), ilike(auditEvents.targetResourceId, `%${search}%`), ilike(auditEvents.correlationId, `%${search}%`)) : undefined,
  );
  const [rows, totals] = await Promise.all([
    db.select().from(auditEvents).where(predicate).orderBy(desc(auditEvents.timestamp)).limit(limit).offset((page - 1) * limit),
    db.select({ value: count() }).from(auditEvents).where(predicate),
  ]);
  const data = rows.map((event) => ({
    id: String(event.id), timestamp: event.timestamp.toISOString(), actor: event.actor,
    actorUserId: event.actorUserId, actorRoleContext: event.actorRoleContext,
    action: event.action, severity: event.severity,
    targetTenantId: event.targetTenantId, targetUserId: event.targetUserId,
    targetResourceType: event.targetResourceType, targetResourceId: event.targetResourceId,
    previousState: event.previousState, newState: event.newState,
    correlationId: event.correlationId, reason: event.reason,
    sourceApplication: event.sourceApplication, details: event.details,
  }));
  const total = Number(totals[0]?.value || 0);
  return { data, events: data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
