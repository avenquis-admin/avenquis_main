import { Router } from "express";
import {
  getMetrics,
  getSystemStatus,
  getFirms,
  getFirmById,
  getUsers,
  getAccessRequests,
  getAuditEvents,
  suspendFirm,
  activateFirm,
  getPlatformSubscriptions,
  getPlatformCollections
} from "./admin.controller";
import { requireAuth } from "../../middlewares/authMiddleware";
import { requirePlatformSuperAdmin } from "../../middlewares/tenantMiddleware";

const router = Router();

// ALL admin routes require authentication and platform admin privileges
router.use(requireAuth, requirePlatformSuperAdmin);

// Analytics & Overview
router.get("/overview/metrics", getMetrics);
router.get("/overview/system-status", getSystemStatus);

// Firm Management
router.get("/firms", getFirms);
router.get("/firms/:id", getFirmById);
router.post("/firms/:id/suspend", suspendFirm);
router.post("/firms/:id/activate", activateFirm);

// User & Access Management
router.get("/users", getUsers);
router.get("/access-requests", getAccessRequests);

// Billing & Subscriptions
router.get("/billing/subscriptions", getPlatformSubscriptions);
router.get("/billing/collections", getPlatformCollections);

// Audit
router.get("/audit/events", getAuditEvents);

export default router;
