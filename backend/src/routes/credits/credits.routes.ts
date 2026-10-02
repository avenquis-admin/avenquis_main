import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requireAuth } from "../../middlewares/authMiddleware";
import { ApiError } from "../../middlewares/errorHandler";
import { getWalletActivityForUser, getWalletSnapshotForUser } from "../../services/creditAccounting";
import { cancelRechargeRequest, createRechargeRequest, listRechargeRequestsForUser, RECHARGE_STATUSES } from "../../services/rechargeRequests";

const router = Router();
const activityQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) });
const rechargeQuery = z.object({ status: z.enum(RECHARGE_STATUSES).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) });
const createRechargeSchema = z.object({
  creditsRequested: z.number().int().positive().max(10_000_000),
  paymentReference: z.string().trim().min(3).max(200),
  paymentMethod: z.string().trim().min(2).max(80),
  requesterNote: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
});
const cancelRechargeSchema = z.object({ reason: z.string().trim().min(3).max(500) });

function ownerContext(req: Request) {
  if (!req.user) throw new ApiError(401, "UNAUTHORIZED", "Not authenticated.");
  const rawFirmId = req.header("X-Firm-Id")?.trim();
  if (!rawFirmId) return { userId: req.user.id };
  const firmId = Number(rawFirmId);
  if (!Number.isInteger(firmId) || firmId <= 0) throw new ApiError(400, "INVALID_FIRM_ID", "X-Firm-Id must be a positive integer.");
  return { userId: req.user.id, firmId };
}

router.get("/credits/wallet", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ success: true, data: await getWalletSnapshotForUser(ownerContext(req)) });
  } catch (error) {
    next(error);
  }
});

router.get("/credits/activity", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = activityQuery.parse(req.query);
    res.status(200).json({ success: true, data: await getWalletActivityForUser(ownerContext(req), query.limit) });
  } catch (error) {
    next(error);
  }
});

router.get("/credits/recharges", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = rechargeQuery.parse(req.query);
    res.status(200).json({ success: true, data: await listRechargeRequestsForUser(ownerContext(req), query.status, query.limit) });
  } catch (error) { next(error); }
});

router.post("/credits/recharges", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createRechargeSchema.parse(req.body);
    res.status(201).json({ success: true, data: await createRechargeRequest({ ...ownerContext(req), ...input }) });
  } catch (error) { next(error); }
});

router.post("/credits/recharges/:id/cancel", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const input = cancelRechargeSchema.parse(req.body);
    res.status(200).json({ success: true, data: await cancelRechargeRequest(ownerContext(req), id, input.reason) });
  } catch (error) { next(error); }
});

export default router;
