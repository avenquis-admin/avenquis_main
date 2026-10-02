import { Request, Response, NextFunction } from "express";
import { db } from "../../db";
import { practiceInvoices, practicePayments, clients, engagements } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { ApiError } from "../../middlewares/errorHandler";

// Practice Invoicing
export const listInvoices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const invoices = await db.select().from(practiceInvoices).where(eq(practiceInvoices.firmId, firmId));
    res.json({ success: true, data: invoices });
  } catch (error) {
    next(error);
  }
};

export const getInvoiceById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const invId = parseInt(req.params.id as string, 10);
    const [inv] = await db.select().from(practiceInvoices).where(and(eq(practiceInvoices.id, invId), eq(practiceInvoices.firmId, firmId)));
    if (!inv) throw new ApiError(404, "NOT_FOUND", "Invoice not found");
    res.json({ success: true, data: inv });
  } catch (error) {
    next(error);
  }
};

export const createInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const { clientId, engagementId, amount, taxAmount, totalAmount, dueDate } = req.body;

    if (!clientId || !amount || !totalAmount) {
      throw new ApiError(400, "VALIDATION_ERROR", "Missing required fields");
    }

    // Verify ownership
    const [client] = await db.select().from(clients).where(and(eq(clients.id, parseInt(clientId)), eq(clients.firmId, firmId)));
    if (!client) throw new ApiError(403, "FORBIDDEN", "Client does not exist or belong to this firm");

    if (engagementId) {
      const [eng] = await db.select().from(engagements).where(and(eq(engagements.id, parseInt(engagementId)), eq(engagements.firmId, firmId)));
      if (!eng) throw new ApiError(403, "FORBIDDEN", "Engagement does not exist or belong to this firm");
    }

    // Amount validation server-side
    const numAmount = parseFloat(amount);
    const numTax = taxAmount ? parseFloat(taxAmount) : 0;
    const calculatedTotal = (numAmount + numTax).toFixed(2);

    // We enforce exact string comparison to prevent tampering
    if (parseFloat(totalAmount).toFixed(2) !== calculatedTotal) {
      throw new ApiError(400, "VALIDATION_ERROR", "Total amount calculation mismatch");
    }

    const [inv] = await db.insert(practiceInvoices).values({
      firmId,
      clientId: parseInt(clientId),
      engagementId: engagementId ? parseInt(engagementId) : null,
      amount: numAmount.toFixed(2),
      taxAmount: numTax.toFixed(2),
      totalAmount: calculatedTotal,
      dueDate: dueDate ? new Date(dueDate) : null,
      status: "DRAFT"
    }).returning();

    res.status(201).json({ success: true, data: inv });
  } catch (error) {
    next(error);
  }
};

export const updateInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const invId = parseInt(req.params.id as string, 10);
    const { status, amount, taxAmount, totalAmount, dueDate } = req.body;

    const [inv] = await db.select().from(practiceInvoices).where(and(eq(practiceInvoices.id, invId), eq(practiceInvoices.firmId, firmId)));
    if (!inv) throw new ApiError(404, "NOT_FOUND", "Invoice not found");

    if (inv.status !== "DRAFT" && amount) {
      throw new ApiError(400, "VALIDATION_ERROR", "Cannot change amount of non-draft invoice");
    }

    const [updatedInv] = await db.update(practiceInvoices)
      .set({ status: status || inv.status, updatedAt: new Date() })
      .where(and(eq(practiceInvoices.id, invId), eq(practiceInvoices.firmId, firmId)))
      .returning();

    res.json({ success: true, data: updatedInv });
  } catch (error) {
    next(error);
  }
};

export const recordPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const invId = parseInt(req.params.id as string, 10);
    const { amount, method } = req.body;

    const [inv] = await db.select().from(practiceInvoices).where(and(eq(practiceInvoices.id, invId), eq(practiceInvoices.firmId, firmId)));
    if (!inv) throw new ApiError(404, "NOT_FOUND", "Invoice not found");
    if (inv.status === "DRAFT") throw new ApiError(400, "VALIDATION_ERROR", "Cannot pay draft invoice");

    const [payment] = await db.insert(practicePayments).values({
      firmId,
      invoiceId: invId,
      amount: parseFloat(amount).toFixed(2),
      method: method || "Bank Transfer"
    }).returning();

    // Mark invoice partially or fully paid based on sums (simplified)
    await db.update(practiceInvoices).set({ status: "PAID", updatedAt: new Date() }).where(eq(practiceInvoices.id, invId));

    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

export const issueInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const invId = parseInt(req.params.id as string, 10);

    const [inv] = await db.update(practiceInvoices)
      .set({ status: "ISSUED", updatedAt: new Date() })
      .where(and(eq(practiceInvoices.id, invId), eq(practiceInvoices.firmId, firmId), eq(practiceInvoices.status, "DRAFT")))
      .returning();

    if (!inv) throw new ApiError(404, "NOT_FOUND", "Draft invoice not found");
    res.json({ success: true, data: inv });
  } catch (error) {
    next(error);
  }
};
