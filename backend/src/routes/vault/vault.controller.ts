import { Request, Response, NextFunction } from "express";
import { db } from "../../db";
import { workingPapers, documents, engagements, clients, firmUsers } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { ApiError } from "../../middlewares/errorHandler";
import { storageService } from "../../services/storage.service";

// WORKING PAPERS
export const getWorkingPapers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const allWP = await db.select().from(workingPapers).where(and(eq(workingPapers.firmId, firmId), eq(workingPapers.isArchived, false)));
    res.json({ success: true, data: allWP });
  } catch (error) {
    next(error);
  }
};

export const getWorkingPaperById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const wpId = parseInt(req.params.id as string, 10);
    const [wp] = await db.select().from(workingPapers).where(and(eq(workingPapers.id, wpId), eq(workingPapers.firmId, firmId), eq(workingPapers.isArchived, false)));
    if (!wp) throw new ApiError(404, "NOT_FOUND", "Working Paper not found");
    res.json({ success: true, data: wp });
  } catch (error) {
    next(error);
  }
};

export const createWorkingPaper = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const creatorId = req.user!.id;
    const { title, engagementId, assigneeId, indexCode } = req.body;

    if (!title || !engagementId) throw new ApiError(400, "VALIDATION_ERROR", "Title and engagementId are required");

    // Enforce tenant boundary on engagement and assignee.
    const [eng] = await db.select().from(engagements).where(and(eq(engagements.id, Number(engagementId)), eq(engagements.firmId, firmId)));
    if (!eng) throw new ApiError(403, "FORBIDDEN", "Engagement does not belong to firm");
    if (assigneeId) {
      const [member] = await db.select().from(firmUsers).where(and(eq(firmUsers.userId, Number(assigneeId)), eq(firmUsers.firmId, firmId)));
      if (!member) throw new ApiError(403, "FORBIDDEN", "Assignee does not belong to firm");
    }

    const [wp] = await db.insert(workingPapers).values({
      firmId,
      creatorId,
      engagementId,
      assigneeId: assigneeId || null,
      title,
      indexCode: indexCode || null,
      status: "draft"
    }).returning();

    res.status(201).json({ success: true, data: wp });
  } catch (error) {
    next(error);
  }
};

export const updateWorkingPaper = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const wpId = parseInt(req.params.id as string, 10);
    const { title, indexCode, assigneeId } = req.body;

    if (assigneeId) {
      const [member] = await db.select().from(firmUsers).where(and(eq(firmUsers.userId, Number(assigneeId)), eq(firmUsers.firmId, firmId)));
      if (!member) throw new ApiError(403, "FORBIDDEN", "Assignee does not belong to firm");
    }

    const [wp] = await db.update(workingPapers)
      .set({ title, indexCode, assigneeId, updatedAt: new Date() })
      .where(and(eq(workingPapers.id, wpId), eq(workingPapers.firmId, firmId), eq(workingPapers.isArchived, false)))
      .returning();

    if (!wp) throw new ApiError(404, "NOT_FOUND", "Working Paper not found");
    res.json({ success: true, data: wp });
  } catch (error) {
    next(error);
  }
};

export const reviewWorkingPaper = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const userId = req.user!.id;
    const wpId = parseInt(req.params.id as string, 10);
    const { action } = req.body; // e.g. "approve"

    if (action === "approve") {
      const [wp] = await db.update(workingPapers)
        .set({ status: "signed_off", signedOffById: userId, signedOffAt: new Date(), updatedAt: new Date() })
        .where(and(eq(workingPapers.id, wpId), eq(workingPapers.firmId, firmId), eq(workingPapers.isArchived, false)))
        .returning();

      if (!wp) throw new ApiError(404, "NOT_FOUND", "Working Paper not found");
      res.json({ success: true, data: wp });
    } else {
      throw new ApiError(400, "VALIDATION_ERROR", "Unknown review action");
    }
  } catch (error) {
    next(error);
  }
};

export const archiveWorkingPaper = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const wpId = parseInt(req.params.id as string, 10);
    const [wp] = await db.update(workingPapers)
      .set({ isArchived: true, archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(workingPapers.id, wpId), eq(workingPapers.firmId, firmId), eq(workingPapers.isArchived, false)))
      .returning();

    if (!wp) throw new ApiError(404, "NOT_FOUND", "Working Paper not found");
    res.json({ success: true, data: wp });
  } catch (error) {
    next(error);
  }
};

// DOCUMENTS
export const getDocuments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const docs = await db.select().from(documents).where(eq(documents.firmId, firmId));
    res.json({ success: true, data: docs });
  } catch (error) {
    next(error);
  }
};

export const getDocumentById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const docId = parseInt(req.params.id as string, 10);
    const [doc] = await db.select().from(documents).where(and(eq(documents.id, docId), eq(documents.firmId, firmId)));
    if (!doc) throw new ApiError(404, "NOT_FOUND", "Document not found");
    res.json({ success: true, data: doc });
  } catch (error) {
    next(error);
  }
};

export const downloadDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const docId = parseInt(req.params.id as string, 10);
    const [doc] = await db.select().from(documents).where(and(eq(documents.id, docId), eq(documents.firmId, firmId)));
    if (!doc) throw new ApiError(404, "NOT_FOUND", "Document not found");

    const stream = await storageService.getFileStream(firmId, doc.storagePath);
    if (!stream) throw new ApiError(404, "NOT_FOUND", "File physical object not found");

    res.setHeader("Content-Disposition", `attachment; filename="${doc.originalName}"`);
    res.setHeader("Content-Type", doc.mimeType);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};

export const uploadDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const uploadedById = req.user!.id;
    const file = req.file;

    if (!file) throw new ApiError(400, "VALIDATION_ERROR", "No file uploaded");

    const { engagementId, clientId, workingPaperId } = req.body;
    const linkedClientId = clientId ? Number(clientId) : null;
    const linkedEngagementId = engagementId ? Number(engagementId) : null;
    const linkedWorkingPaperId = workingPaperId ? Number(workingPaperId) : null;

    let linkedEngagement: typeof engagements.$inferSelect | undefined;
    if (linkedClientId) {
      const [client] = await db.select().from(clients).where(and(eq(clients.id, linkedClientId), eq(clients.firmId, firmId)));
      if (!client) throw new ApiError(403, "FORBIDDEN", "Client does not belong to firm");
    }
    if (linkedEngagementId) {
      [linkedEngagement] = await db.select().from(engagements).where(and(eq(engagements.id, linkedEngagementId), eq(engagements.firmId, firmId)));
      if (!linkedEngagement) throw new ApiError(403, "FORBIDDEN", "Engagement does not belong to firm");
      if (linkedClientId && linkedEngagement.clientId !== linkedClientId) throw new ApiError(400, "VALIDATION_ERROR", "Engagement does not belong to client");
    }
    if (linkedWorkingPaperId) {
      const [wp] = await db.select().from(workingPapers).where(and(eq(workingPapers.id, linkedWorkingPaperId), eq(workingPapers.firmId, firmId), eq(workingPapers.isArchived, false)));
      if (!wp) throw new ApiError(403, "FORBIDDEN", "Working Paper does not belong to firm");
      if (linkedEngagementId && wp.engagementId !== linkedEngagementId) throw new ApiError(400, "VALIDATION_ERROR", "Working Paper does not belong to engagement");
      if (linkedClientId) {
        const engagement = linkedEngagement || (await db.select().from(engagements).where(and(eq(engagements.id, wp.engagementId), eq(engagements.firmId, firmId))))[0];
        if (!engagement || engagement.clientId !== linkedClientId) throw new ApiError(400, "VALIDATION_ERROR", "Working Paper does not belong to client");
      }
    }

    // Construct isolated path: firms/{firmId}/docs/...
    const storageDir = `firms/${firmId}/docs`;
    const storagePath = await storageService.uploadFile(firmId, file, storageDir);

    const [doc] = await db.insert(documents).values({
      firmId,
      uploadedById,
      clientId: linkedClientId,
      engagementId: linkedEngagementId,
      workingPaperId: linkedWorkingPaperId,
      filename: file.filename || file.originalname,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storagePath
    }).returning();

    res.status(201).json({ success: true, data: doc });
  } catch (error) {
    next(error);
  }
};

export const deleteDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const docId = parseInt(req.params.id as string, 10);

    const [doc] = await db.delete(documents)
      .where(and(eq(documents.id, docId), eq(documents.firmId, firmId)))
      .returning();

    if (!doc) throw new ApiError(404, "NOT_FOUND", "Document not found");

    await storageService.deleteFile(firmId, doc.storagePath);

    res.json({ success: true, data: doc });
  } catch (error) {
    next(error);
  }
};
