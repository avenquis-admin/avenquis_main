import { Router } from "express";
import {
  listInvoices, getInvoiceById, createInvoice, updateInvoice, recordPayment, issueInvoice
} from "./finance.controller";
import { requireAuth } from "../../middlewares/authMiddleware";
import { resolveFirmContext, requireEntitlement, requireFirmPermission } from "../../middlewares/tenantMiddleware";

const router = Router();
const tenantMiddlewares = [requireAuth, resolveFirmContext];

// Practice Invoicing endpoints
router.get("/invoices", ...tenantMiddlewares, requireEntitlement("officeFinance"), requireFirmPermission("billing:read"), listInvoices);
router.get("/invoices/:id", ...tenantMiddlewares, requireEntitlement("officeFinance"), requireFirmPermission("billing:read"), getInvoiceById);
router.post("/invoices", ...tenantMiddlewares, requireEntitlement("officeFinance"), requireFirmPermission("billing:write"), createInvoice);
router.patch("/invoices/:id", ...tenantMiddlewares, requireEntitlement("officeFinance"), requireFirmPermission("billing:write"), updateInvoice);
router.post("/invoices/:id/payments", ...tenantMiddlewares, requireEntitlement("officeFinance"), requireFirmPermission("billing:write"), recordPayment);
router.post("/invoices/:id/issue", ...tenantMiddlewares, requireEntitlement("officeFinance"), requireFirmPermission("billing:write"), issueInvoice);

export default router;
