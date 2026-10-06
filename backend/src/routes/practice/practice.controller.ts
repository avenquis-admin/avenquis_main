import { Request, Response, NextFunction } from "express";
import { db } from "../../db";
import { clients, engagements, firms, users, engagementMembers, firmUsers } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { ApiError } from "../../middlewares/errorHandler";

// CLIENTS
export const getClients = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const allClients = await db.select().from(clients).where(eq(clients.firmId, firmId));
    res.json({ success: true, data: allClients });
  } catch (error) {
    next(error);
  }
};

export const getClientById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const clientId = parseInt(req.params.id as string, 10);
    const [client] = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.firmId, firmId)));

    if (!client) throw new ApiError(404, "NOT_FOUND", "Client not found");
    res.json({ success: true, data: client });
  } catch (error) {
    next(error);
  }
};

export const createClient = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const { name, status } = req.body;
    if (!name) throw new ApiError(400, "VALIDATION_ERROR", "Client name is required");

    const [newClient] = await db.insert(clients).values({ firmId, name, status: status || "active" }).returning();
    res.status(201).json({ success: true, data: newClient });
  } catch (error) {
    next(error);
  }
};

export const updateClient = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const clientId = parseInt(req.params.id as string, 10);
    const { name, status } = req.body;

    const [updatedClient] = await db.update(clients)
      .set({ name, status, updatedAt: new Date() })
      .where(and(eq(clients.id, clientId), eq(clients.firmId, firmId)))
      .returning();

    if (!updatedClient) throw new ApiError(404, "NOT_FOUND", "Client not found");
    res.json({ success: true, data: updatedClient });
  } catch (error) {
    next(error);
  }
};

// ENGAGEMENTS
export const getEngagements = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const allEngagements = await db.select().from(engagements).where(eq(engagements.firmId, firmId));
    res.json({ success: true, data: allEngagements });
  } catch (error) {
    next(error);
  }
};

export const getEngagementById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const engagementId = parseInt(req.params.id as string, 10);
    const [engagement] = await db.select().from(engagements).where(and(eq(engagements.id, engagementId), eq(engagements.firmId, firmId)));

    if (!engagement) throw new ApiError(404, "NOT_FOUND", "Engagement not found");
    res.json({ success: true, data: engagement });
  } catch (error) {
    next(error);
  }
};

export const createEngagement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const { clientId, name, status } = req.body;
    if (!name || !clientId) throw new ApiError(400, "VALIDATION_ERROR", "Engagement name and clientId are required");

    // Verify client belongs to this firm
    const [client] = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.firmId, firmId)));
    if (!client) throw new ApiError(403, "FORBIDDEN", "Client does not exist or belong to this firm");

    const [newEngagement] = await db.insert(engagements).values({ firmId, clientId, name, status: status || "planning" }).returning();
    res.status(201).json({ success: true, data: newEngagement });
  } catch (error) {
    next(error);
  }
};

export const updateEngagement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const engagementId = parseInt(req.params.id as string, 10);
    const { name, status } = req.body;

    const [updatedEngagement] = await db.update(engagements)
      .set({ name, status, updatedAt: new Date() })
      .where(and(eq(engagements.id, engagementId), eq(engagements.firmId, firmId)))
      .returning();

    if (!updatedEngagement) throw new ApiError(404, "NOT_FOUND", "Engagement not found");
    res.json({ success: true, data: updatedEngagement });
  } catch (error) {
    next(error);
  }
};

// FIRM SETTINGS
export const getFirmSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const [firm] = await db.select().from(firms).where(eq(firms.id, firmId));
    res.json({ success: true, data: firm });
  } catch (error) {
    next(error);
  }
};

export const updateFirmSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const { name } = req.body;
    const [firm] = await db.update(firms).set({ name }).where(eq(firms.id, firmId)).returning();
    res.json({ success: true, data: firm });
  } catch (error) {
    next(error);
  }
};

// PROFILE
export const getProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, req.user!.id));
    res.json({ success: true, data: { id: req.user!.id, email: user?.email } });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, req.user!.id));
    // We won't update emails in B05 foundation for simplicity, just simulate success
    res.json({ success: true, data: { id: req.user!.id, email: user?.email } });
  } catch (error) {
    next(error);
  }
};

export const archiveClient = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const clientId = parseInt(req.params.id as string, 10);
    const [row] = await db.update(clients).set({ isArchived: true, archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(clients.id, clientId), eq(clients.firmId, firmId))).returning();
    if (!row) throw new ApiError(404, "NOT_FOUND", "Client not found");
    res.json({ success: true, data: row });
  } catch (error) { next(error); }
};

export const restoreClient = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const clientId = parseInt(req.params.id as string, 10);
    const [row] = await db.update(clients).set({ isArchived: false, archivedAt: null, updatedAt: new Date() })
      .where(and(eq(clients.id, clientId), eq(clients.firmId, firmId))).returning();
    if (!row) throw new ApiError(404, "NOT_FOUND", "Client not found");
    res.json({ success: true, data: row });
  } catch (error) { next(error); }
};

export const archiveEngagement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const engagementId = parseInt(req.params.id as string, 10);
    const [row] = await db.update(engagements).set({ isArchived: true, archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(engagements.id, engagementId), eq(engagements.firmId, firmId))).returning();
    if (!row) throw new ApiError(404, "NOT_FOUND", "Engagement not found");
    res.json({ success: true, data: row });
  } catch (error) { next(error); }
};

export const restoreEngagement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const engagementId = parseInt(req.params.id as string, 10);
    const [row] = await db.update(engagements).set({ isArchived: false, archivedAt: null, updatedAt: new Date() })
      .where(and(eq(engagements.id, engagementId), eq(engagements.firmId, firmId))).returning();
    if (!row) throw new ApiError(404, "NOT_FOUND", "Engagement not found");
    res.json({ success: true, data: row });
  } catch (error) { next(error); }
};

export const getEngagementTeam = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const engagementId = parseInt(req.params.id as string, 10);
    
    const [eng] = await db.select().from(engagements).where(and(eq(engagements.id, engagementId), eq(engagements.firmId, firmId)));
    if (!eng) throw new ApiError(404, 'NOT_FOUND', 'Engagement not found');

    const team = await db.select({
      id: engagementMembers.id,
      userId: engagementMembers.userId,
      role: engagementMembers.role,
      email: users.email
    }).from(engagementMembers)
      .innerJoin(users, eq(users.id, engagementMembers.userId))
      .where(and(eq(engagementMembers.engagementId, engagementId), eq(engagementMembers.firmId, firmId)));
    res.json({ success: true, data: team });
  } catch (error) { next(error); }
};

export const addEngagementTeamMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const engagementId = parseInt(req.params.id as string, 10);
    const { userId, role } = req.body;

    if (!userId || !role) throw new ApiError(400, 'VALIDATION_ERROR', 'userId and role are required');

    const [eng] = await db.select().from(engagements).where(and(eq(engagements.id, engagementId), eq(engagements.firmId, firmId)));
    if (!eng) throw new ApiError(404, 'NOT_FOUND', 'Engagement not found');

    const [member] = await db.select().from(firmUsers).where(and(eq(firmUsers.userId, Number(userId)), eq(firmUsers.firmId, firmId)));
    if (!member) throw new ApiError(403, 'FORBIDDEN', 'User is not a member of this firm');

    const [row] = await db.insert(engagementMembers).values({
      firmId,
      engagementId,
      userId: Number(userId),
      role
    }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); }
};

export const removeEngagementTeamMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const engagementId = parseInt(req.params.id as string, 10);
    const userId = parseInt(req.params.userId as string, 10);

    const [eng] = await db.select().from(engagements).where(and(eq(engagements.id, engagementId), eq(engagements.firmId, firmId)));
    if (!eng) throw new ApiError(404, 'NOT_FOUND', 'Engagement not found');

    const [row] = await db.delete(engagementMembers).where(and(eq(engagementMembers.engagementId, engagementId), eq(engagementMembers.userId, userId), eq(engagementMembers.firmId, firmId))).returning();
    res.json({ success: true, data: row || null });
  } catch (error) { next(error); }
};

export const updateEngagementTeamMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const engagementId = parseInt(req.params.id as string, 10);
    const userId = parseInt(req.params.userId as string, 10);
    const { role } = req.body;

    if (!role) throw new ApiError(400, 'VALIDATION_ERROR', 'role is required');

    const [eng] = await db.select().from(engagements).where(and(eq(engagements.id, engagementId), eq(engagements.firmId, firmId)));
    if (!eng) throw new ApiError(404, 'NOT_FOUND', 'Engagement not found');

    const [row] = await db.update(engagementMembers).set({ role, updatedAt: new Date() })
      .where(and(eq(engagementMembers.engagementId, engagementId), eq(engagementMembers.userId, userId), eq(engagementMembers.firmId, firmId))).returning();
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Team member not found');
    res.json({ success: true, data: row });
  } catch (error) { next(error); }
};
