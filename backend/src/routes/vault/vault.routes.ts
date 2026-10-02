import { Router } from "express";
import multer from "multer";
import os from "os";
import {
  getWorkingPapers, getWorkingPaperById, createWorkingPaper, updateWorkingPaper, reviewWorkingPaper, archiveWorkingPaper,
  getDocuments, getDocumentById, downloadDocument, uploadDocument, deleteDocument
} from "./vault.controller";
import { requireAuth } from "../../middlewares/authMiddleware";
import { resolveFirmContext, requireEntitlement, requireFirmPermission } from "../../middlewares/tenantMiddleware";

const router = Router();
const upload = multer({ dest: os.tmpdir() });

const tenantMiddlewares = [requireAuth, resolveFirmContext];

// WORKING PAPERS
router.get("/working-papers", ...tenantMiddlewares, requireEntitlement("workingPapers"), requireFirmPermission("working_papers:read"), getWorkingPapers);
router.get("/working-papers/:id", ...tenantMiddlewares, requireEntitlement("workingPapers"), requireFirmPermission("working_papers:read"), getWorkingPaperById);
router.post("/working-papers", ...tenantMiddlewares, requireEntitlement("workingPapers"), requireFirmPermission("working_papers:write"), createWorkingPaper);
router.patch("/working-papers/:id", ...tenantMiddlewares, requireEntitlement("workingPapers"), requireFirmPermission("working_papers:write"), updateWorkingPaper);
router.patch("/working-papers/:id/review", ...tenantMiddlewares, requireEntitlement("workingPapers"), requireFirmPermission("working_papers:sign"), reviewWorkingPaper);
router.delete("/working-papers/:id", ...tenantMiddlewares, requireEntitlement("workingPapers"), requireFirmPermission("working_papers:archive"), archiveWorkingPaper);

// DOCUMENTS
router.get("/documents", ...tenantMiddlewares, requireEntitlement("documentVault"), requireFirmPermission("documents:read"), getDocuments);
router.get("/documents/:id", ...tenantMiddlewares, requireEntitlement("documentVault"), requireFirmPermission("documents:read"), getDocumentById);
router.get("/documents/:id/download", ...tenantMiddlewares, requireEntitlement("documentVault"), requireFirmPermission("documents:read"), downloadDocument);
router.post("/documents/upload", ...tenantMiddlewares, requireEntitlement("documentVault"), requireFirmPermission("documents:write"), upload.single("file"), uploadDocument);
router.delete("/documents/:id", ...tenantMiddlewares, requireEntitlement("documentVault"), requireFirmPermission("documents:write"), deleteDocument);

export default router;
