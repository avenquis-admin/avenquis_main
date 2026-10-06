import { Router } from "express";
import {
  getClients, getClientById, createClient, updateClient,
  getEngagements, getEngagementById, createEngagement, updateEngagement,
  getFirmSettings, updateFirmSettings,
  getProfile, updateProfile,
  archiveClient, restoreClient, archiveEngagement, restoreEngagement,
  getEngagementTeam, addEngagementTeamMember, removeEngagementTeamMember, updateEngagementTeamMember
} from "./practice.controller";
import { requireAuth } from "../../middlewares/authMiddleware";
import { resolveFirmContext, requireEntitlement, requireFirmPermission } from "../../middlewares/tenantMiddleware";

const router = Router();

// Profile
router.get("/profile", requireAuth, getProfile);
router.patch("/profile", requireAuth, updateProfile);

// Firm and tenant context
const tenantMiddlewares = [requireAuth, resolveFirmContext];

// Firm settings
router.get("/firm/settings", ...tenantMiddlewares, getFirmSettings);
router.patch("/firm/settings", ...tenantMiddlewares, requireFirmPermission("firm:admin"), updateFirmSettings);

// Clients
router.get("/clients", ...tenantMiddlewares, requireEntitlement("clients"), requireFirmPermission("clients:read"), getClients);
router.get("/clients/:id", ...tenantMiddlewares, requireEntitlement("clients"), requireFirmPermission("clients:read"), getClientById);
router.post("/clients", ...tenantMiddlewares, requireEntitlement("clients"), requireFirmPermission("clients:write"), createClient);
router.patch("/clients/:id", ...tenantMiddlewares, requireEntitlement("clients"), requireFirmPermission("clients:write"), updateClient);
router.post("/clients/:id/archive", ...tenantMiddlewares, requireEntitlement("clients"), requireFirmPermission("clients:write"), archiveClient);
router.post("/clients/:id/restore", ...tenantMiddlewares, requireEntitlement("clients"), requireFirmPermission("clients:write"), restoreClient);

// Engagements
router.get("/engagements", ...tenantMiddlewares, requireEntitlement("engagements"), requireFirmPermission("engagements:read"), getEngagements);
router.get("/engagements/:id", ...tenantMiddlewares, requireEntitlement("engagements"), requireFirmPermission("engagements:read"), getEngagementById);
router.post("/engagements", ...tenantMiddlewares, requireEntitlement("engagements"), requireFirmPermission("engagements:write"), createEngagement);
router.patch("/engagements/:id", ...tenantMiddlewares, requireEntitlement("engagements"), requireFirmPermission("engagements:write"), updateEngagement);
router.post("/engagements/:id/archive", ...tenantMiddlewares, requireEntitlement("engagements"), requireFirmPermission("engagements:write"), archiveEngagement);
router.post("/engagements/:id/restore", ...tenantMiddlewares, requireEntitlement("engagements"), requireFirmPermission("engagements:write"), restoreEngagement);

// Engagement Team
router.get("/engagements/:id/team", ...tenantMiddlewares, requireEntitlement("engagements"), requireFirmPermission("engagements:read"), getEngagementTeam);
router.post("/engagements/:id/team", ...tenantMiddlewares, requireEntitlement("engagements"), requireFirmPermission("engagements:write"), addEngagementTeamMember);
router.patch("/engagements/:id/team/:userId", ...tenantMiddlewares, requireEntitlement("engagements"), requireFirmPermission("engagements:write"), updateEngagementTeamMember);
router.delete("/engagements/:id/team/:userId", ...tenantMiddlewares, requireEntitlement("engagements"), requireFirmPermission("engagements:write"), removeEngagementTeamMember);

export default router;
