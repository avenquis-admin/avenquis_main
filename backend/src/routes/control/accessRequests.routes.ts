import { Router, Request, Response, NextFunction } from "express";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { accessRequests } from "../../db/schema";
import { ApiError } from "../../middlewares/errorHandler";
import { requireControlService } from "../../middlewares/controlServiceAuth";
import { provisionAccessRequest } from "../../services/accessRequestProvisioning";
import { deliverActivationForRequest } from "../../services/activationDelivery";
import { writeAuditEvent } from "../../services/audit";
import { sendAccessRequestDecisionEmail } from "../../services/email";
import { env } from "../../config/env";

const router = Router();

const listQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["pending", "approved", "rejected", "provisioning", "provisioned", "failed", "suspended"]).optional(),
  requestType: z.enum(["individual", "firm"]).optional(),
  applicantType: z.enum(["individual", "firm"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  actor: z.string().trim().min(1).max(200),
  actorId: z.string().trim().min(1).max(200),
  actorPlatformRole: z.enum(["PLATFORM_ADMIN", "PLATFORM_MAINTAINER"]),
  reason: z.string().trim().min(3).max(1000),
  internalNote: z.string().trim().max(2000).optional(),
  assignedRole: z.string().trim().min(2).max(80).optional(),
  assignedFirmId: z.string().trim().min(1).max(120).optional(),
  correlationId: z.string().trim().min(1).max(200),
  ipAddress: z.string().trim().max(200).optional(),
}).superRefine((value, ctx) => {
  if (value.decision === "approved" && !value.assignedRole) {
    ctx.addIssue({ code: "custom", path: ["assignedRole"], message: "assignedRole is required for approval" });
  }
});

const provisioningSchema = z.object({
  actor: z.string().trim().min(1).max(200),
  actorId: z.string().trim().min(1).max(200),
  actorPlatformRole: z.enum(["PLATFORM_ADMIN", "PLATFORM_MAINTAINER"]),
  correlationId: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
  ipAddress: z.string().trim().max(200).optional(),
});

const activationDeliverySchema = provisioningSchema.omit({ idempotencyKey: true });

type AccessRequestRow = typeof accessRequests.$inferSelect;

function toContract(row: AccessRequestRow) {
  return {
    id: String(row.id),
    firmName: row.firmName || undefined,
    applicantType: row.requestType as "individual" | "firm",
    requesterName: row.requesterName,
    requesterEmail: row.requesterEmail,
    mobile: row.mobile,
    requestType: row.requestType,
    requestedRole: row.professionalRole || (row.requestType === "firm" ? "FIRM_OWNER" : "STAFF"),
    professionalRole: row.professionalRole || undefined,
    professionalRegistration: row.professionalRegistration || undefined,
    principalName: row.principalName || undefined,
    articleshipRegistrationDate: row.articleshipRegistrationDate || undefined,
    articleshipPeriod: row.articleshipPeriod || undefined,
    currentCaLevel: row.currentCaLevel || undefined,
    examProgressStatus: row.examProgressStatus || undefined,
    accessReasons: row.accessReasons ? JSON.parse(row.accessReasons) : undefined,
    otherReason: row.otherReason || undefined,
    additionalNote: row.additionalNote || undefined,
    reasonUseCase: row.reasonUseCase,
    partnerName: row.partnerName || undefined,
    practiceType: row.practiceType || undefined,
    firmSize: row.firmSize || undefined,
    assignedRole: row.assignedRole || undefined,
    assignedFirmId: row.assignedFirmId || undefined,
    status: row.status,
    submittedAt: row.submittedAt,
    updatedAt: row.updatedAt,
    reviewer: row.reviewer || undefined,
    reviewerId: row.reviewerId || undefined,
    reviewerPlatformRole: row.reviewerPlatformRole || undefined,
    reviewedAt: row.reviewedAt || undefined,
    reason: row.reviewReason || undefined,
    rejectionReason: row.status === "rejected" ? row.reviewReason || undefined : undefined,
    internalNote: row.internalNote || undefined,
    correlationId: row.correlationId || undefined,
    provisioningIdempotencyKey: row.provisioningIdempotencyKey || undefined,
    provisioningAttempts: row.provisioningAttempts,
    provisioningStartedAt: row.provisioningStartedAt || undefined,
    provisionedAt: row.provisionedAt || undefined,
    provisioningError: row.provisioningError || undefined,
    provisionedUserId: row.provisionedUserId ? String(row.provisionedUserId) : undefined,
    provisionedFirmId: row.provisionedFirmId ? String(row.provisionedFirmId) : undefined,
    subscriptionId: row.subscriptionId ? String(row.subscriptionId) : undefined,
    walletId: row.walletId ? String(row.walletId) : undefined,
    activationTokenId: row.activationTokenId ? String(row.activationTokenId) : undefined,
    activationStatus: row.activationStatus || undefined,
    activationDeliveryAttempts: row.activationDeliveryAttempts,
    activationDeliveryStartedAt: row.activationDeliveryStartedAt || undefined,
    activationDeliveredAt: row.activationDeliveredAt || undefined,
    activationDeliveryError: row.activationDeliveryError || undefined,
  };
}

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "INVALID_ACCESS_REQUEST_ID", "Access request ID must be a positive integer.");
  return id;
}

router.use(requireControlService);

router.get("/access-requests", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const conditions = [];
    const applicantType = query.applicantType || query.requestType;
    if (query.status) conditions.push(eq(accessRequests.status, query.status));
    if (applicantType) conditions.push(eq(accessRequests.requestType, applicantType));
    if (query.search) {
      conditions.push(or(
        ilike(accessRequests.requesterName, `%${query.search}%`),
        ilike(accessRequests.requesterEmail, `%${query.search}%`),
        ilike(accessRequests.firmName, `%${query.search}%`),
      )!);
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const offset = (query.page - 1) * query.limit;
    const [rows, totals] = await Promise.all([
      db.select().from(accessRequests).where(where).orderBy(desc(accessRequests.submittedAt)).limit(query.limit).offset(offset),
      db.select({ value: count() }).from(accessRequests).where(where),
    ]);
    const data = rows.map(toContract);
    res.status(200).json({ requests: data, data, accessRequests: data, total: Number(totals[0]?.value || 0), page: query.page, limit: query.limit });
  } catch (error) {
    next(error);
  }
});

router.get("/access-requests/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [row] = await db.select().from(accessRequests).where(eq(accessRequests.id, parseId(String(req.params.id)))).limit(1);
    if (!row) throw new ApiError(404, "ACCESS_REQUEST_NOT_FOUND", "Access request not found.");
    res.status(200).json(toContract(row));
  } catch (error) {
    next(error);
  }
});

router.post("/access-requests/:id/review", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseId(String(req.params.id));
    const input = reviewSchema.parse(req.body);
    const reviewedAt = new Date();
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(accessRequests).set({
        status: input.decision,
        assignedRole: input.decision === "approved" ? input.assignedRole : undefined,
        assignedFirmId: input.decision === "approved" ? input.assignedFirmId : undefined,
        reviewer: input.actor,
        reviewerId: input.actorId,
        reviewerPlatformRole: input.actorPlatformRole,
        reviewReason: input.reason,
        internalNote: input.internalNote,
        correlationId: input.correlationId,
        reviewedAt,
        updatedAt: reviewedAt,
      }).where(and(eq(accessRequests.id, id), eq(accessRequests.status, "pending"))).returning();

      if (!updated) {
        const [current] = await tx.select({ status: accessRequests.status }).from(accessRequests).where(eq(accessRequests.id, id)).limit(1);
        if (!current) throw new ApiError(404, "ACCESS_REQUEST_NOT_FOUND", "Access request not found.");
        throw new ApiError(409, "ACCESS_REQUEST_STATE_CONFLICT", `Access request cannot be reviewed from '${current.status}' state.`);
      }

      await writeAuditEvent(tx, {
        actor: input.actor, actorUserId: input.actorId, actorRoleContext: input.actorPlatformRole,
        action: input.decision === "approved" ? "ACCESS_REQUEST_APPROVED" : "ACCESS_REQUEST_REJECTED",
        targetTenantId: input.assignedFirmId, targetResourceType: "access_request", targetResourceId: id,
        previousState: "pending", newState: input.decision, correlationId: input.correlationId,
        reason: input.reason, sourceApplication: "control", metadata: { ipAddress: input.ipAddress, assignedRole: input.assignedRole },
      });
      return updated;
    });

    let responseRow = result;
    let notification: { status: "delivered" | "failed"; provider?: string } | undefined;
    if (input.decision === "rejected") {
      try {
        const delivered = await sendAccessRequestDecisionEmail({
          to: result.requesterEmail,
          recipientName: result.requesterName,
          decision: "rejected",
          reason: input.reason,
          idempotencyKey: `access-rejection:${id}`,
        });
        notification = { status: "delivered", provider: delivered.provider };
        await writeAuditEvent(db, {
          actor: input.actor, actorUserId: input.actorId, actorRoleContext: input.actorPlatformRole,
          action: "ACCESS_REQUEST_REJECTION_NOTIFICATION_DELIVERED", targetResourceType: "access_request", targetResourceId: id,
          previousState: "pending", newState: "rejected", correlationId: input.correlationId,
          reason: "Rejection notification delivered", sourceApplication: "core", metadata: { provider: delivered.provider },
        });
      } catch {
        notification = { status: "failed" };
        await writeAuditEvent(db, {
          actor: input.actor, actorUserId: input.actorId, actorRoleContext: input.actorPlatformRole,
          action: "ACCESS_REQUEST_REJECTION_NOTIFICATION_FAILED", severity: "warning", targetResourceType: "access_request", targetResourceId: id,
          previousState: "pending", newState: "rejected", correlationId: input.correlationId,
          reason: "Rejection notification delivery failed", sourceApplication: "core", metadata: { provider: env.EMAIL_PROVIDER },
        });
      }
    }
    if (input.decision === "approved") {
      await provisionAccessRequest(id, {
        actor: input.actor,
        actorId: input.actorId,
        actorPlatformRole: input.actorPlatformRole,
        correlationId: input.correlationId,
        idempotencyKey: `access-request:${id}`,
        ipAddress: input.ipAddress,
      });
      try {
        await deliverActivationForRequest(id, {
          actor: input.actor,
          actorId: input.actorId,
          actorPlatformRole: input.actorPlatformRole,
          correlationId: input.correlationId,
          ipAddress: input.ipAddress,
        });
      } catch (deliveryError) {
        if (!(deliveryError instanceof ApiError) || deliveryError.code !== "ACTIVATION_DELIVERY_FAILED") throw deliveryError;
      }
      [responseRow] = await db.select().from(accessRequests).where(eq(accessRequests.id, id)).limit(1);
    }

    res.setHeader("x-request-id", input.correlationId);
    res.status(200).json({ request: toContract(responseRow), data: toContract(responseRow), previousState: "pending", newState: responseRow.status, correlationId: input.correlationId, notification });
  } catch (error) {
    next(error);
  }
});

router.post("/access-requests/:id/provision", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseId(String(req.params.id));
    const input = provisioningSchema.parse(req.body);
    const result = await provisionAccessRequest(id, input);
    const [request] = await db.select().from(accessRequests).where(eq(accessRequests.id, id)).limit(1);
    if (!request) throw new ApiError(404, "ACCESS_REQUEST_NOT_FOUND", "Access request not found.");
    res.setHeader("x-request-id", input.correlationId);
    res.status(200).json({ request: toContract(request), data: toContract(request), provisioning: result, correlationId: input.correlationId });
  } catch (error) {
    next(error);
  }
});

router.post("/access-requests/:id/deliver-activation", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseId(String(req.params.id));
    const input = activationDeliverySchema.parse(req.body);
    const delivery = await deliverActivationForRequest(id, input);
    const [request] = await db.select().from(accessRequests).where(eq(accessRequests.id, id)).limit(1);
    if (!request) throw new ApiError(404, "ACCESS_REQUEST_NOT_FOUND", "Access request not found.");
    res.setHeader("x-request-id", input.correlationId);
    res.status(200).json({ request: toContract(request), data: toContract(request), delivery, correlationId: input.correlationId });
  } catch (error) {
    next(error);
  }
});

export default router;
