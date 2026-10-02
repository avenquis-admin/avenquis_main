import { Router } from "express";
import {
  getTasks, getTaskById, createTask, updateTask, assignTask, updateTaskStatus,
  getTimesheets, getTimesheetById, createTimesheet, updateTimesheet, deleteTimesheet,
  getNotifications, getUnreadCount, markAsRead, markAllAsRead
} from "./operations.controller";
import { requireAuth } from "../../middlewares/authMiddleware";
import { resolveFirmContext, requireEntitlement, requireFirmPermission } from "../../middlewares/tenantMiddleware";

const router = Router();

const tenantMiddlewares = [requireAuth, resolveFirmContext];

// TASKS
router.get("/tasks", ...tenantMiddlewares, requireEntitlement("tasks"), requireFirmPermission("tasks:read"), getTasks);
router.get("/tasks/:id", ...tenantMiddlewares, requireEntitlement("tasks"), requireFirmPermission("tasks:read"), getTaskById);
router.post("/tasks", ...tenantMiddlewares, requireEntitlement("tasks"), requireFirmPermission("tasks:write"), createTask);
router.patch("/tasks/:id", ...tenantMiddlewares, requireEntitlement("tasks"), requireFirmPermission("tasks:write"), updateTask);
router.post("/tasks/:id/assign", ...tenantMiddlewares, requireEntitlement("tasks"), requireFirmPermission("tasks:write"), assignTask);
router.patch("/tasks/:id/status", ...tenantMiddlewares, requireEntitlement("tasks"), requireFirmPermission("tasks:write"), updateTaskStatus);

// TIMESHEETS
router.get("/timesheets", ...tenantMiddlewares, requireEntitlement("timesheets"), getTimesheets); // users should read timesheets without strict permission? Wait, `timesheets:write` is needed. In B03 `STAFF` has `timesheets:write`. Let's just use `requireAuth` and let them see their own or we can use `timesheets:write`.
// Actually in B03 everyone has `timesheets:write`.
router.get("/timesheets/:id", ...tenantMiddlewares, requireEntitlement("timesheets"), getTimesheetById);
router.post("/timesheets", ...tenantMiddlewares, requireEntitlement("timesheets"), requireFirmPermission("timesheets:write"), createTimesheet);
router.patch("/timesheets/:id", ...tenantMiddlewares, requireEntitlement("timesheets"), requireFirmPermission("timesheets:write"), updateTimesheet);
router.delete("/timesheets/:id", ...tenantMiddlewares, requireEntitlement("timesheets"), requireFirmPermission("timesheets:write"), deleteTimesheet);

// NOTIFICATIONS
// Everyone can see their own notifications
router.get("/notifications", ...tenantMiddlewares, getNotifications);
router.get("/notifications/unread-count", ...tenantMiddlewares, getUnreadCount);
router.patch("/notifications/:id/read", ...tenantMiddlewares, markAsRead);
router.post("/notifications/mark-all-read", ...tenantMiddlewares, markAllAsRead);

export default router;
