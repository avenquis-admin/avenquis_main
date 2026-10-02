import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { firmUsers, firms } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { ApiError } from "./errorHandler";
import { FirmRole, hasPermission } from "./rbac";
import { pool } from "../db";

export const resolveFirmContext = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new ApiError(401, "UNAUTHORIZED", "Not authenticated"));
  }

  const firmIdHeader = req.header("X-Firm-Id");
  if (!firmIdHeader) {
    return next(new ApiError(400, "BAD_REQUEST", "Missing X-Firm-Id header"));
  }

  const firmId = parseInt(firmIdHeader, 10);
  if (isNaN(firmId)) {
    return next(new ApiError(400, "BAD_REQUEST", "Invalid X-Firm-Id header"));
  }

  try {
    const [membership] = await db
      .select()
      .from(firmUsers)
      .where(and(eq(firmUsers.userId, req.user.id), eq(firmUsers.firmId, firmId)));

    if (!membership) {
      return next(new ApiError(403, "FORBIDDEN", "You do not have access to this firm"));
    }

    if (membership.status !== "active") {
      return next(new ApiError(403, "MEMBERSHIP_REVOKED", "Your access to this firm has been revoked"));
    }

    const [firm] = await db.select({ status: firms.status }).from(firms).where(eq(firms.id, firmId));
    if (!firm || firm.status !== "active") {
      return next(new ApiError(403, "FIRM_SUSPENDED", "Firm access is suspended"));
    }

    req.firm = { id: membership.firmId };
    req.firmRole = membership.role as FirmRole;

    next();
  } catch (error) {
    next(error);
  }
};

export const requireFirmRole = (allowedRoles: FirmRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.firmRole || !allowedRoles.includes(req.firmRole)) {
      return next(new ApiError(403, "FORBIDDEN", "Insufficient firm role"));
    }
    next();
  };
};

export const requireFirmPermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.firmRole || !hasPermission(req.firmRole, permission)) {
      return next(new ApiError(403, "FORBIDDEN", `Missing required permission: ${permission}`));
    }
    next();
  };
};

export const requireEntitlement = (moduleKey: string) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.firm) return next(new ApiError(400, "FIRM_CONTEXT_REQUIRED", "Firm context is required for entitlement checks"));
    try {
      const result = await pool.query(`
        SELECT e.subscription_status AS "entitlementStatus", s.subscription_status AS "subscriptionStatus",
          e.effective_from AS "effectiveFrom", e.effective_until AS "effectiveUntil",
          COALESCE((e.modules ->> $2)::boolean, false) AS enabled
        FROM firm_entitlements e
        JOIN firm_subscriptions s ON s.firm_id = e.firm_id
        WHERE e.firm_id = $1
        LIMIT 1
      `, [req.firm.id, moduleKey]);
      const entitlement = result.rows[0];
      if (!entitlement) return next(new ApiError(403, "ENTITLEMENT_REQUIRED", `The '${moduleKey}' module is not entitled for this firm`));
      if (!["active", "trialing"].includes(entitlement.subscriptionStatus) || !["active", "trialing"].includes(entitlement.entitlementStatus)) {
        return next(new ApiError(403, "SUBSCRIPTION_INACTIVE", "The firm subscription does not permit access"));
      }
      const now = Date.now();
      if (new Date(entitlement.effectiveFrom).getTime() > now || (entitlement.effectiveUntil && new Date(entitlement.effectiveUntil).getTime() <= now)) {
        return next(new ApiError(403, "ENTITLEMENT_INACTIVE", "The firm entitlement is outside its effective period"));
      }
      if (!entitlement.enabled) return next(new ApiError(403, "MODULE_NOT_ENTITLED", `The '${moduleKey}' module is disabled`));
      next();
    } catch (error) {
      next(error);
    }
  };
};

export const requirePlatformSuperAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.platformRole !== "PLATFORM_SUPER_ADMIN") {
    return next(new ApiError(403, "FORBIDDEN", "Requires Platform Super Admin privileges"));
  }
  next();
};
