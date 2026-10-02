import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requireControlService } from "../../middlewares/controlServiceAuth";
import { chatbotMetricsForControl, listKnowledgeForControl, reviewKnowledgeForControl } from "../../services/chatbot";

const router = Router();
router.use(requireControlService);

const listQuery = z.object({
  status: z.enum(["CANDIDATE", "VERIFIED", "APPROVED", "RETIRED"]).optional(),
  tenantId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

const reviewBody = z.object({
  decision: z.enum(["VERIFIED", "APPROVED", "RETIRED"]),
  actor: z.string().trim().min(2).max(160),
  actorId: z.string().trim().min(1).max(160),
  actorPlatformRole: z.enum(["PLATFORM_ADMIN", "PLATFORM_MAINTAINER"]),
  reason: z.string().trim().min(3).max(500),
  correlationId: z.string().trim().min(1).max(200),
  expectedVersion: z.number().int().positive().optional(),
});

router.get("/chatbot/knowledge", async (req: Request, res: Response, next: NextFunction) => {
  try { res.status(200).json({ success: true, data: await listKnowledgeForControl(listQuery.parse(req.query)) }); }
  catch (error) { next(error); }
});

router.post("/chatbot/knowledge/:id/review", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    res.status(200).json({ success: true, data: await reviewKnowledgeForControl({ id, ...reviewBody.parse(req.body) }) });
  } catch (error) { next(error); }
});

router.get("/chatbot/metrics", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.query.tenantId === undefined ? undefined : z.coerce.number().int().positive().parse(req.query.tenantId);
    res.status(200).json({ success: true, data: await chatbotMetricsForControl(tenantId) });
  } catch (error) { next(error); }
});

export default router;
