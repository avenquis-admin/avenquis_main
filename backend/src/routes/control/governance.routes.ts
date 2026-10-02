import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requireControlService } from "../../middlewares/controlServiceAuth";
import { ApiError } from "../../middlewares/errorHandler";
import { getGovernanceFirm, getGovernanceUser, listGovernanceFirmMembers, listGovernanceFirms, listGovernanceUsers, revokeFirmAccess, transitionFirm, transitionUser } from "../../services/governance";

const router = Router();
router.use(requireControlService);

const actorSchema = z.object({ actor: z.string().trim().min(1).max(200), actorId: z.string().trim().min(1).max(200), actorPlatformRole: z.enum(["PLATFORM_ADMIN", "PLATFORM_MAINTAINER"]), reason: z.string().trim().min(3).max(500), correlationId: z.string().trim().min(1).max(200) });
const listSchema = z.object({ search: z.string().trim().max(200).optional(), status: z.string().trim().max(40).optional(), role: z.string().trim().max(40).optional(), firmId: z.coerce.number().int().positive().optional(), page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().positive().max(200).default(50) });
const revokeSchema = actorSchema.extend({ firmId: z.number().int().positive() });

function id(value: string, label: string) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed <= 0) throw new ApiError(400, "INVALID_GOVERNANCE_ID", `${label} must be a positive integer.`); return parsed; }
const handle = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => { try { res.status(200).json({ success: true, data: await fn(req) }); } catch (error) { next(error); } };

router.get("/governance/firms", handle(async (req) => listGovernanceFirms(listSchema.parse(req.query))));
router.get("/governance/firms/:id", handle(async (req) => getGovernanceFirm(id(String(req.params.id), "Firm ID"))));
router.get("/governance/firms/:id/members", handle(async (req) => listGovernanceFirmMembers(id(String(req.params.id), "Firm ID"))));
router.post("/governance/firms/:id/activate", handle(async (req) => transitionFirm(id(String(req.params.id), "Firm ID"), "activate", actorSchema.parse(req.body))));
router.post("/governance/firms/:id/suspend", handle(async (req) => transitionFirm(id(String(req.params.id), "Firm ID"), "suspend", actorSchema.parse(req.body))));
router.post("/governance/firms/:id/reactivate", handle(async (req) => transitionFirm(id(String(req.params.id), "Firm ID"), "reactivate", actorSchema.parse(req.body))));
router.get("/governance/users", handle(async (req) => listGovernanceUsers(listSchema.parse(req.query))));
router.get("/governance/users/:id", handle(async (req) => getGovernanceUser(id(String(req.params.id), "User ID"))));
router.post("/governance/users/:id/enable", handle(async (req) => transitionUser(id(String(req.params.id), "User ID"), "enable", actorSchema.parse(req.body))));
router.post("/governance/users/:id/disable", handle(async (req) => transitionUser(id(String(req.params.id), "User ID"), "disable", actorSchema.parse(req.body))));
router.post("/governance/users/:id/revoke-access", handle(async (req) => { const body = revokeSchema.parse(req.body); return revokeFirmAccess(id(String(req.params.id), "User ID"), body.firmId, body); }));

export default router;
