import { Request, Response, NextFunction } from "express";
import { db } from "../../db";
import { users, firms, firmUsers, accessRequests, platformSubscriptions, platformCollections } from "../../db/schema";
import { eq, desc, count } from "drizzle-orm";
import { ApiError } from "../../middlewares/errorHandler";
import { listAuditEvents, writeAuditEvent } from "../../services/audit";

export const getMetrics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const totalFirms = await db.select({ count: count() }).from(firms);
    const totalUsers = await db.select({ count: count() }).from(users);

    res.json({
      success: true,
      data: [
        { id: "firms", label: "Active Firms", value: totalFirms[0].count },
        { id: "users", label: "Total Users", value: totalUsers[0].count }
      ],
    });
  } catch (error) {
    next(error);
  }
};

export const getSystemStatus = async (req: Request, res: Response, next: NextFunction) => {
  res.json({
    success: true,
    data: [
      { name: "Primary Database", status: "healthy", latency: "12ms", region: "local" }
    ],
  });
};

export const getFirms = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const allFirms = await db.select().from(firms).orderBy(desc(firms.createdAt));
    res.json({
      success: true,
      data: allFirms.map(f => ({
        id: f.id.toString(),
        name: f.name,
        subdomain: f.subdomain,
        status: f.status,
        usersCount: 0,
        seatsAllocated: 10,
        seatsActive: 0,
        subscriptionStatus: "Active",
        primaryContact: "Admin",
        mrr: "$0",
        onboardedDate: f.createdAt.toISOString(),
        createdAt: f.createdAt.toISOString(),
        aiEnabled: false
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getFirmById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = parseInt(req.params.id as string, 10);
    const [firm] = await db.select().from(firms).where(eq(firms.id, firmId));
    if (!firm) throw new ApiError(404, "NOT_FOUND", "Firm not found");

    res.json({
      success: true,
      data: {
        id: firm.id.toString(),
        name: firm.name,
        subdomain: firm.subdomain,
        status: firm.status,
        usersCount: 0,
        seatsAllocated: 10,
        seatsActive: 0,
        subscriptionStatus: "Active",
        primaryContact: "Admin",
        mrr: "$0",
        onboardedDate: firm.createdAt.toISOString(),
        createdAt: firm.createdAt.toISOString(),
        aiEnabled: false
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
    res.json({
      success: true,
      data: allUsers.map(u => ({
        id: u.id.toString(),
        name: u.email.split("@")[0],
        email: u.email,
        firm: "Multiple",
        role: u.platformRole || "Firm User",
        membershipStatus: "Active",
        accountStatus: "Verified",
        lastActive: u.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getAccessRequests = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requests = await db.select().from(accessRequests).orderBy(desc(accessRequests.submittedAt));
    res.json({
      success: true,
      data: requests.map(r => ({
        id: r.id.toString(),
        firmName: r.firmName,
        requesterName: r.requesterName,
        requesterEmail: r.requesterEmail,
        mobile: r.mobile,
        professionalRole: r.professionalRole,
        professionalRegistration: r.professionalRegistration,
        principalName: r.principalName,
        articleshipRegistrationDate: r.articleshipRegistrationDate,
        articleshipPeriod: r.articleshipPeriod,
        currentCaLevel: r.currentCaLevel,
        examProgressStatus: r.examProgressStatus,
        accessReasons: r.accessReasons ? JSON.parse(r.accessReasons) : undefined,
        otherReason: r.otherReason,
        additionalNote: r.additionalNote,
        partnerName: r.partnerName,
        practiceType: r.practiceType,
        requestType: r.requestType,
        reasonUseCase: r.reasonUseCase,
        status: r.status,
        jurisdiction: "Global",
        firmSize: r.firmSize,
        submittedAt: r.submittedAt.toISOString()
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getAuditEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const events = await listAuditEvents({ page: 1, limit: 200 });
    // Preserve the legacy admin display contract while the stored/control-facing
    // action remains a stable machine-readable X6 code.
    const data = events.data.map((event) => ({
      ...event,
      action: event.action === "FIRM_SUSPENDED"
        ? `Suspended firm ${event.targetResourceId}`
        : event.action === "FIRM_REACTIVATED"
          ? `Activated firm ${event.targetResourceId}`
          : event.action,
    }));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// --- B08 Platform Billing Endpoints ---
export const getPlatformSubscriptions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subscriptions = await db.select({
      id: platformSubscriptions.id,
      firmId: platformSubscriptions.firmId,
      firmName: firms.name,
      plan: platformSubscriptions.plan,
      status: platformSubscriptions.status,
      billingInterval: platformSubscriptions.billingInterval,
      amount: platformSubscriptions.amount,
      nextBillingDate: platformSubscriptions.nextBillingDate
    })
    .from(platformSubscriptions)
    .leftJoin(firms, eq(platformSubscriptions.firmId, firms.id));

    res.json({ success: true, data: subscriptions });
  } catch (error) {
    next(error);
  }
};

export const getPlatformCollections = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const collections = await db.select({
      id: platformCollections.id,
      firmId: platformCollections.firmId,
      firm: firms.name,
      plan: platformSubscriptions.plan,
      outstandingAmount: platformCollections.outstandingAmount,
      dueDate: platformCollections.dueDate,
      age: platformCollections.age,
      status: platformCollections.status
    })
    .from(platformCollections)
    .leftJoin(firms, eq(platformCollections.firmId, firms.id))
    .leftJoin(platformSubscriptions, eq(platformCollections.firmId, platformSubscriptions.firmId));

    res.json({ success: true, data: collections });
  } catch (error) {
    next(error);
  }
};

// Mutations
export const suspendFirm = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = parseInt(req.params.id as string, 10);
    const { reason } = req.body;
    const firm = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(firms).where(eq(firms.id, firmId)).for("update").limit(1);
      if (!current) throw new ApiError(404, "NOT_FOUND", "Firm not found");
      const [updated] = await tx.update(firms).set({ status: "suspended", updatedAt: new Date() }).where(eq(firms.id, firmId)).returning();
      await writeAuditEvent(tx, {
        actor: `user:${req.user!.id}`, actorUserId: req.user!.id, actorRoleContext: req.user!.platformRole,
        action: "FIRM_SUSPENDED", targetTenantId: firmId, targetResourceType: "firm", targetResourceId: firmId,
        previousState: current.status, newState: "suspended", correlationId: req.id,
        reason: String(reason || "Administrative suspension"), sourceApplication: "core",
      });
      return updated;
    });

    res.json({ success: true, data: firm });
  } catch (error) {
    next(error);
  }
};

export const activateFirm = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = parseInt(req.params.id as string, 10);
    const firm = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(firms).where(eq(firms.id, firmId)).for("update").limit(1);
      if (!current) throw new ApiError(404, "NOT_FOUND", "Firm not found");
      const [updated] = await tx.update(firms).set({ status: "active", updatedAt: new Date() }).where(eq(firms.id, firmId)).returning();
      await writeAuditEvent(tx, {
        actor: `user:${req.user!.id}`, actorUserId: req.user!.id, actorRoleContext: req.user!.platformRole,
        action: "FIRM_REACTIVATED", targetTenantId: firmId, targetResourceType: "firm", targetResourceId: firmId,
        previousState: current.status, newState: "active", correlationId: req.id,
        reason: String(req.body?.reason || "Administrative reactivation"), sourceApplication: "core",
      });
      return updated;
    });

    res.json({ success: true, data: firm });
  } catch (error) {
    next(error);
  }
};
