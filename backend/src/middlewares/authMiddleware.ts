import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "./errorHandler";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export const requireSession = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.avenquis_session;

  if (!token) {
    return next(new ApiError(401, "UNAUTHORIZED", "Authentication token missing"));
  }

  let payload: { userId: number; platformRole: string | null };
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as { userId: number; platformRole: string | null };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) return next(new ApiError(401, "UNAUTHORIZED", "Token expired"));
    return next(new ApiError(401, "UNAUTHORIZED", "Invalid token"));
  }

  try {
    const [currentUser] = await db.select({ id: users.id, status: users.status, platformRole: users.platformRole, mustChangePassword: users.mustChangePassword }).from(users).where(eq(users.id, payload.userId)).limit(1);
    if (!currentUser) return next(new ApiError(401, "UNAUTHORIZED", "Account no longer exists"));
    if (currentUser.status !== "active") return next(new ApiError(403, "ACCOUNT_DISABLED", "Account access is disabled"));
    req.user = { id: currentUser.id, platformRole: currentUser.platformRole as any, mustChangePassword: currentUser.mustChangePassword };
    next();
  } catch (error) {
    return next(error);
  }
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  void requireSession(req, res, (error?: unknown) => {
    if (error) return next(error);
    if (req.user?.mustChangePassword) {
      return next(new ApiError(403, "PASSWORD_CHANGE_REQUIRED", "You must change your temporary password before accessing the workspace."));
    }
    next();
  });
};
