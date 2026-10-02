import { Request, Response, NextFunction } from "express";
import { db } from "../../db";
import { users, firmUsers, firms, passwordResetTokens, activationTokens, accessRequests, platformSubscriptions, creditWallets } from "../../db/schema";
import { eq, and, isNull, gt, or } from "drizzle-orm";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { activateAccountSchema, changeInitialPasswordSchema, loginSchema } from "./auth.schemas";
import { ApiError } from "../../middlewares/errorHandler";
import crypto from "crypto";
import { writeAuditEvent } from "../../services/audit";

const COOKIE_NAME = "avenquis_session";

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = loginSchema.parse(req.body);

    const [user] = await db.select().from(users).where(eq(users.email, data.email));

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid email or password");
    }

    const isValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!isValid) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid email or password");
    }
    if (user.status !== "active") {
      throw new ApiError(403, "ACCOUNT_NOT_ACTIVE", "This account is not active.");
    }

    const token = jwt.sign({
      userId: user.id,
      platformRole: user.platformRole
    }, env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        platformRole: user.platformRole,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const me = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, "UNAUTHORIZED", "Not authenticated");
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "User not found");
    }

    // Fetch firm memberships
    const memberships = await db
      .select({
        firmId: firmUsers.firmId,
        role: firmUsers.role,
        firmName: firms.name,
      })
      .from(firmUsers)
      .innerJoin(firms, eq(firmUsers.firmId, firms.id))
      .where(eq(firmUsers.userId, userId));

    const primaryFirm = memberships[0] || null;

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName || user.email.split("@")[0],
        status: user.status,
        platformRole: user.platformRole,
        firmId: primaryFirm?.firmId?.toString() || null,
        firmName: primaryFirm?.firmName || null,
        role: primaryFirm?.role || user.accountRole || null,
        firms: memberships.map(m => ({
          firmId: m.firmId,
          firmName: m.firmName,
          role: m.role,
        })),
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
    });

    res.json({
      success: true,
      data: {
        message: "Logged out successfully",
      },
    });
  } catch (error) {
    next(error);
  }
};


export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, "UNAUTHORIZED", "Not authenticated");
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      throw new ApiError(400, "VALIDATION_ERROR", "currentPassword and newPassword (minimum 8 characters) are required");
    }
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new ApiError(401, "UNAUTHORIZED", "Current password is incorrect");
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
      await writeAuditEvent(tx, {
        actor: `user:${userId}`, actorUserId: userId, actorRoleContext: user.accountRole,
        action: "PASSWORD_CHANGED", targetUserId: userId, targetResourceType: "user", targetResourceId: userId,
        previousState: "credential_active", newState: "credential_changed", correlationId: req.id,
        reason: "Authenticated self-service password change", sourceApplication: "core",
      });
    });
    res.json({ success: true, data: { message: "Password changed successfully" } });
  } catch (error) { next(error); }
};

export const changeInitialPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, "UNAUTHORIZED", "Not authenticated");
    const input = changeInitialPasswordSchema.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new ApiError(401, "UNAUTHORIZED", "User not found");
    if (!user.mustChangePassword) throw new ApiError(409, "INITIAL_PASSWORD_CHANGE_NOT_REQUIRED", "The initial password has already been changed.");
    if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
      throw new ApiError(401, "CURRENT_PASSWORD_INCORRECT", "Current password is incorrect.");
    }
    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, userId));
      await writeAuditEvent(tx, {
        actor: `user:${userId}`, actorUserId: userId, actorRoleContext: user.accountRole,
        action: "INITIAL_PASSWORD_CHANGED", targetUserId: userId, targetResourceType: "user", targetResourceId: userId,
        previousState: "password_change_required", newState: "credential_active", correlationId: req.id,
        reason: "Required first-login password change completed", sourceApplication: "core",
      });
    });
    res.json({ success: true, data: { message: "Password changed successfully", mustChangePassword: false } });
  } catch (error) { next(error); }
};

export const requestPasswordReset = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) throw new ApiError(400, "VALIDATION_ERROR", "email is required");
    const [user] = await db.select().from(users).where(eq(users.email, email));
    // Always return success to avoid account enumeration.
    if (!user) return res.json({ success: true, data: { message: "If the account exists, a reset request has been created" } });

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await db.transaction(async (tx) => {
      const [reset] = await tx.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) }).returning({ id: passwordResetTokens.id });
      await writeAuditEvent(tx, {
        actor: `user:${user.id}`, actorUserId: user.id, actorRoleContext: user.accountRole,
        action: "PASSWORD_RESET_REQUESTED", targetUserId: user.id, targetResourceType: "password_reset", targetResourceId: reset.id,
        previousState: "not_requested", newState: "pending", correlationId: req.id,
        reason: "Self-service password reset requested", sourceApplication: "core",
      });
    });

    const data: Record<string, unknown> = { message: "If the account exists, a reset request has been created" };
    // Development-only handoff until email delivery is implemented.
    if (env.NODE_ENV !== "production") data.devResetToken = token;
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || typeof newPassword !== "string" || newPassword.length < 8) {
      throw new ApiError(400, "VALIDATION_ERROR", "token and newPassword (minimum 8 characters) are required");
    }
    const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex");
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.transaction(async (tx) => {
      const [reset] = await tx.select().from(passwordResetTokens).where(and(
        eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())
      )).for("update").limit(1);
      if (!reset) throw new ApiError(400, "INVALID_RESET_TOKEN", "Reset token is invalid or expired");
      const [user] = await tx.update(users).set({ passwordHash, mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, reset.userId)).returning();
      const [consumed] = await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(and(eq(passwordResetTokens.id, reset.id), isNull(passwordResetTokens.usedAt))).returning();
      if (!consumed || !user) throw new ApiError(409, "PASSWORD_RESET_CONFLICT", "Password reset was already consumed.");
      await writeAuditEvent(tx, {
        actor: `user:${reset.userId}`, actorUserId: reset.userId, actorRoleContext: user.accountRole,
        action: "PASSWORD_RESET_COMPLETED", targetUserId: reset.userId, targetResourceType: "password_reset", targetResourceId: reset.id,
        previousState: "pending", newState: "used", correlationId: req.id,
        reason: "Self-service password reset completed", sourceApplication: "core",
      });
    });
    res.json({ success: true, data: { message: "Password reset successfully" } });
  } catch (error) { next(error); }
};

export const activateAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = activateAccountSchema.parse(req.body);
    const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex");
    const passwordHash = await bcrypt.hash(input.password, 12);
    const activatedAt = new Date();

    const result = await db.transaction(async (tx) => {
      const [token] = await tx.select().from(activationTokens).where(eq(activationTokens.tokenHash, tokenHash)).limit(1);
      if (!token) throw new ApiError(400, "INVALID_ACTIVATION_TOKEN", "Activation token is invalid.");
      if (token.usedAt) throw new ApiError(409, "ACTIVATION_TOKEN_USED", "Activation token has already been used.");
      if (token.expiresAt <= activatedAt) throw new ApiError(410, "ACTIVATION_TOKEN_EXPIRED", "Activation token has expired. Request a new activation email.");

      const [consumed] = await tx.update(activationTokens).set({ usedAt: activatedAt, updatedAt: activatedAt }).where(and(
        eq(activationTokens.id, token.id),
        isNull(activationTokens.usedAt),
        gt(activationTokens.expiresAt, activatedAt),
      )).returning({ id: activationTokens.id });
      if (!consumed) throw new ApiError(409, "ACTIVATION_TOKEN_CONFLICT", "Activation token was consumed by another request.");

      const [user] = await tx.update(users).set({
        passwordHash,
        status: "active",
        mustChangePassword: false,
        updatedAt: activatedAt,
      }).where(and(eq(users.id, token.userId), or(eq(users.status, "pending_activation"), and(eq(users.status, "active"), eq(users.mustChangePassword, true))))).returning();
      if (!user) throw new ApiError(409, "ACCOUNT_ACTIVATION_STATE_CONFLICT", "Account cannot be activated from its current state.");

      const [subscription] = await tx.update(platformSubscriptions).set({ status: "Active", updatedAt: activatedAt }).where(eq(platformSubscriptions.accessRequestId, token.accessRequestId)).returning();
      await tx.update(creditWallets).set({ status: "active", updatedAt: activatedAt }).where(eq(creditWallets.accessRequestId, token.accessRequestId));
      const [accessRequest] = await tx.update(accessRequests).set({ activationStatus: "activated", updatedAt: activatedAt }).where(and(
        eq(accessRequests.id, token.accessRequestId),
        eq(accessRequests.provisionedUserId, user.id),
      )).returning();
      if (!accessRequest) throw new ApiError(409, "ACTIVATION_REQUEST_MISMATCH", "Activation token does not match the provisioned access request.");
      if (accessRequest.provisionedFirmId) {
        await tx.update(firms).set({ status: "active", updatedAt: activatedAt }).where(eq(firms.id, accessRequest.provisionedFirmId));
      }

      await writeAuditEvent(tx, {
        actor: `user:${user.id}`, actorUserId: user.id, actorRoleContext: user.accountRole,
        action: "ACCOUNT_ACTIVATED", targetTenantId: accessRequest.provisionedFirmId,
        targetUserId: user.id, targetResourceType: "user", targetResourceId: user.id,
        previousState: "pending_activation", newState: "active", correlationId: req.id,
        reason: "One-time activation completed", sourceApplication: "core",
        metadata: { targetAccessRequestId: String(token.accessRequestId), activationTokenRecordId: String(token.id) },
      });
      if (subscription) await writeAuditEvent(tx, {
        actor: `user:${user.id}`, actorUserId: user.id, actorRoleContext: user.accountRole,
        action: "SUBSCRIPTION_ACTIVATED", targetTenantId: subscription.firmId, targetUserId: subscription.userId,
        targetResourceType: "subscription", targetResourceId: subscription.id,
        previousState: "Pending Activation", newState: subscription.status, correlationId: req.id,
        reason: "Subscription activated with account", sourceApplication: "core",
      });
      return user;
    });

    res.status(200).json({
      success: true,
      data: { email: result.email, status: result.status, message: "Account activated. You can now sign in." },
    });
  } catch (error) {
    next(error);
  }
};
