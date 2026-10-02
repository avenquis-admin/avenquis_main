import { NextFunction, Request, Response, Router } from "express";
import { requireAuth } from "../../middlewares/authMiddleware";
import { resolveFirmContext, requireEntitlement, requireFirmPermission } from "../../middlewares/tenantMiddleware";
import * as c from "./core.controller";

const router = Router();
const tenant = [requireAuth, resolveFirmContext] as const;
const resolveAssistantContext = (req: Request, res: Response, next: NextFunction) => {
  if (!req.header("X-Firm-Id")) return next();
  return resolveFirmContext(req, res, next);
};
const requireAssistantPermission = (req: Request, res: Response, next: NextFunction) => {
  if (!req.firm) return next();
  return requireFirmPermission("ai:use")(req, res, next);
};

router.get("/people", ...tenant, requireEntitlement("people"), requireFirmPermission("people:read"), c.getPeople);
router.get("/people/:id", ...tenant, requireEntitlement("people"), requireFirmPermission("people:read"), c.getPerson);
router.post("/people", ...tenant, requireEntitlement("people"), requireFirmPermission("people:write"), c.createPerson);
router.patch("/people/:id", ...tenant, requireEntitlement("people"), requireFirmPermission("people:write"), c.updatePerson);

router.get("/attendance", ...tenant, requireEntitlement("people"), requireFirmPermission("attendance:read"), c.getAttendance);
router.post("/attendance", ...tenant, requireEntitlement("people"), requireFirmPermission("attendance:write"), c.createAttendance);
router.patch("/attendance/:id", ...tenant, requireEntitlement("people"), requireFirmPermission("attendance:write"), c.updateAttendance);

router.get("/performance", ...tenant, requireEntitlement("people"), requireFirmPermission("performance:read"), c.getPerformance);
router.post("/performance", ...tenant, requireEntitlement("people"), requireFirmPermission("performance:write"), c.createPerformance);
router.patch("/performance/:id", ...tenant, requireEntitlement("people"), requireFirmPermission("performance:write"), c.updatePerformance);

router.get("/payroll", ...tenant, requireEntitlement("people"), requireFirmPermission("payroll:read"), c.getPayroll);
router.post("/payroll", ...tenant, requireEntitlement("people"), requireFirmPermission("payroll:write"), c.createPayroll);
router.patch("/payroll/:id", ...tenant, requireEntitlement("people"), requireFirmPermission("payroll:write"), c.updatePayroll);

router.get("/calendar", ...tenant, requireEntitlement("tasks"), requireFirmPermission("calendar:read"), c.getCalendar);
router.post("/calendar", ...tenant, requireEntitlement("tasks"), requireFirmPermission("calendar:write"), c.createCalendarEvent);

router.get("/reports/summary", ...tenant, requireEntitlement("dashboard"), requireFirmPermission("reports:read"), c.getReportSummary);
router.get("/dashboard/summary", ...tenant, requireEntitlement("dashboard"), requireFirmPermission("dashboard:read"), c.getDashboardSummary);

router.get("/client-portal/access", ...tenant, requireEntitlement("clientRequests"), requireFirmPermission("portal:admin"), c.getPortalAccess);
router.post("/client-portal/access", ...tenant, requireEntitlement("clientRequests"), requireFirmPermission("portal:admin"), c.createPortalAccess);
router.patch("/client-portal/access/:id", ...tenant, requireEntitlement("clientRequests"), requireFirmPermission("portal:admin"), c.updatePortalAccess);
router.get("/client-portal/document-requests", ...tenant, requireEntitlement("clientRequests"), requireFirmPermission("portal:read"), c.getDocumentRequests);
router.post("/client-portal/document-requests", ...tenant, requireEntitlement("clientRequests"), requireFirmPermission("portal:admin"), c.createDocumentRequest);
router.patch("/client-portal/document-requests/:id", ...tenant, requireEntitlement("clientRequests"), requireFirmPermission("portal:admin"), c.updateDocumentRequest);

router.post("/ai/assist", requireAuth, resolveAssistantContext, requireEntitlement("aiAssistance"), requireAssistantPermission, c.aiAssist);

export default router;
