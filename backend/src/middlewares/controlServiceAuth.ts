import { timingSafeEqual } from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { ApiError } from "./errorHandler";

function tokensMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function requireControlService(req: Request, _res: Response, next: NextFunction): void {
  const expected = env.CONTROL_SERVICE_TOKEN;
  if (!expected) {
    next(new ApiError(503, "CONTROL_CONTRACT_NOT_CONFIGURED", "The Core-Control service contract is not configured."));
    return;
  }

  const authorization = req.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token || !tokensMatch(token, expected)) {
    next(new ApiError(401, "INVALID_CONTROL_SERVICE_TOKEN", "A valid Control service credential is required."));
    return;
  }

  next();
}
