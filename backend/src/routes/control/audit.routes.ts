import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requireControlService } from "../../middlewares/controlServiceAuth";
import { listAuditEvents } from "../../services/audit";

const router = Router();
const querySchema = z.object({
  action: z.string().trim().max(120).optional(),
  sourceApplication: z.enum(["core", "control"]).optional(),
  targetTenantId: z.string().trim().max(120).optional(),
  correlationId: z.string().trim().max(200).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

router.use(requireControlService);
router.get("/audit-events", async (req: Request, res: Response, next: NextFunction) => {
  try { res.status(200).json({ success: true, data: await listAuditEvents(querySchema.parse(req.query)) }); }
  catch (error) { next(error); }
});

export default router;
