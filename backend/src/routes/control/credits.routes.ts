import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requireControlService } from "../../middlewares/controlServiceAuth";
import { ApiError } from "../../middlewares/errorHandler";
import { adjustCredits, getWalletForControl } from "../../services/creditAccounting";
import { getRechargeRequestForControl, listRechargeRequestsForControl, RECHARGE_STATUSES, reviewRechargeRequest } from "../../services/rechargeRequests";

const router = Router();
const walletQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) });
const adjustmentSchema = z.object({
  amount: z.number().int().safe().refine((value) => value !== 0, "amount must be non-zero"),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(8).max(200),
  correlationId: z.string().trim().min(1).max(200),
  actor: z.string().trim().min(1).max(200),
  actorId: z.string().trim().min(1).max(200),
  actorPlatformRole: z.enum(["PLATFORM_ADMIN", "PLATFORM_MAINTAINER"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const rechargeListSchema = z.object({ status: z.enum(RECHARGE_STATUSES).optional(), search: z.string().trim().max(200).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50) });
const rechargeReviewSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(8).max(200),
  correlationId: z.string().trim().min(1).max(200),
  actor: z.string().trim().min(1).max(200),
  actorId: z.string().trim().min(1).max(200),
  actorPlatformRole: z.enum(["PLATFORM_ADMIN", "PLATFORM_MAINTAINER"]),
});

function walletId(raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new ApiError(400, "INVALID_CREDIT_WALLET_ID", "Wallet ID must be a positive integer.");
  return value;
}

router.use(requireControlService);

router.get("/credit-wallets/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = walletQuerySchema.parse(req.query);
    res.status(200).json({ success: true, data: await getWalletForControl(walletId(String(req.params.id)), query.limit) });
  } catch (error) {
    next(error);
  }
});

router.post("/credit-wallets/:id/adjustments", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = adjustmentSchema.parse(req.body);
    res.status(200).json({ success: true, data: await adjustCredits({ walletId: walletId(String(req.params.id)), ...input }) });
  } catch (error) {
    next(error);
  }
});

router.get("/recharge-requests", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = rechargeListSchema.parse(req.query);
    res.status(200).json({ success: true, data: await listRechargeRequestsForControl(query) });
  } catch (error) { next(error); }
});

router.get("/recharge-requests/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ success: true, data: await getRechargeRequestForControl(walletId(String(req.params.id))) });
  } catch (error) { next(error); }
});

router.post("/recharge-requests/:id/review", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = rechargeReviewSchema.parse(req.body);
    res.status(200).json({ success: true, data: await reviewRechargeRequest({ requestId: walletId(String(req.params.id)), ...input }) });
  } catch (error) { next(error); }
});

export default router;
