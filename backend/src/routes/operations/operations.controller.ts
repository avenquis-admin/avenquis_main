import { Request, Response, NextFunction } from "express";
import { db } from "../../db";
import { tasks, timesheets, notifications, firmUsers, clients, engagements } from "../../db/schema";
import { eq, and, count } from "drizzle-orm";
import { ApiError } from "../../middlewares/errorHandler";
import { hasPermission } from "../../middlewares/rbac";

// TASKS
export const getTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const allTasks = await db.select().from(tasks).where(eq(tasks.firmId, firmId));
    res.json({ success: true, data: allTasks });
  } catch (error) {
    next(error);
  }
};

export const getTaskById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const taskId = parseInt(req.params.id as string, 10);
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.firmId, firmId)));
    if (!task) throw new ApiError(404, "NOT_FOUND", "Task not found");
    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

export const createTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const creatorId = req.user!.id;
    const { title, status, priority, dueDate, assigneeId, clientId, engagementId } = req.body;

    if (!title) throw new ApiError(400, "VALIDATION_ERROR", "Task title is required");

    // Optional: Validate assignee belongs to firm
    if (assigneeId) {
      const [member] = await db.select().from(firmUsers).where(and(eq(firmUsers.userId, assigneeId), eq(firmUsers.firmId, firmId)));
      if (!member) throw new ApiError(403, "FORBIDDEN", "Assignee does not belong to firm");
    }

    const [newTask] = await db.insert(tasks).values({
      firmId,
      creatorId,
      title,
      status: status || "todo",
      priority: priority || "medium",
      dueDate: dueDate ? new Date(dueDate) : null,
      assigneeId: assigneeId || null,
      clientId: clientId || null,
      engagementId: engagementId || null
    }).returning();

    res.status(201).json({ success: true, data: newTask });
  } catch (error) {
    next(error);
  }
};

export const updateTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const taskId = parseInt(req.params.id as string, 10);
    const { title, dueDate, priority } = req.body;

    const [updatedTask] = await db.update(tasks)
      .set({ title, dueDate: dueDate ? new Date(dueDate) : null, priority, updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.firmId, firmId)))
      .returning();

    if (!updatedTask) throw new ApiError(404, "NOT_FOUND", "Task not found");
    res.json({ success: true, data: updatedTask });
  } catch (error) {
    next(error);
  }
};

export const assignTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const taskId = parseInt(req.params.id as string, 10);
    const { assigneeId } = req.body;

    if (assigneeId) {
      const [member] = await db.select().from(firmUsers).where(and(eq(firmUsers.userId, assigneeId), eq(firmUsers.firmId, firmId)));
      if (!member) throw new ApiError(403, "FORBIDDEN", "Assignee does not belong to firm");
    }

    const [updatedTask] = await db.update(tasks)
      .set({ assigneeId: assigneeId || null, updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.firmId, firmId)))
      .returning();

    if (!updatedTask) throw new ApiError(404, "NOT_FOUND", "Task not found");
    res.json({ success: true, data: updatedTask });
  } catch (error) {
    next(error);
  }
};

export const updateTaskStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const taskId = parseInt(req.params.id as string, 10);
    const { status } = req.body;

    if (!status) throw new ApiError(400, "VALIDATION_ERROR", "Status is required");

    const [updatedTask] = await db.update(tasks)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.firmId, firmId)))
      .returning();

    if (!updatedTask) throw new ApiError(404, "NOT_FOUND", "Task not found");
    res.json({ success: true, data: updatedTask });
  } catch (error) {
    next(error);
  }
};

// TIMESHEETS
export const getTimesheets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const canApprove = !!req.firmRole && hasPermission(req.firmRole, "timesheets:approve");
    const allTimesheets = await db.select().from(timesheets).where(
      canApprove ? eq(timesheets.firmId, firmId) : and(eq(timesheets.firmId, firmId), eq(timesheets.userId, req.user!.id))
    );
    res.json({ success: true, data: allTimesheets });
  } catch (error) {
    next(error);
  }
};

export const getTimesheetById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const timesheetId = parseInt(req.params.id as string, 10);
    const [sheet] = await db.select().from(timesheets).where(and(eq(timesheets.id, timesheetId), eq(timesheets.firmId, firmId)));
    if (!sheet) throw new ApiError(404, "NOT_FOUND", "Timesheet not found");
    const canApprove = !!req.firmRole && hasPermission(req.firmRole, "timesheets:approve");
    if (!canApprove && sheet.userId !== req.user!.id) throw new ApiError(403, "FORBIDDEN", "Cannot access another user's timesheet");
    res.json({ success: true, data: sheet });
  } catch (error) {
    next(error);
  }
};

export const createTimesheet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const userId = req.user!.id;
    const { date, durationHours, clientId, engagementId, taskId } = req.body;

    if (!date || durationHours === undefined) throw new ApiError(400, "VALIDATION_ERROR", "Date and duration are required");

    let linkedEngagement: typeof engagements.$inferSelect | undefined;
    if (clientId) {
      const [client] = await db.select().from(clients).where(and(eq(clients.id, Number(clientId)), eq(clients.firmId, firmId)));
      if (!client) throw new ApiError(403, "FORBIDDEN", "Client boundary violation");
    }
    if (engagementId) {
      [linkedEngagement] = await db.select().from(engagements).where(and(eq(engagements.id, Number(engagementId)), eq(engagements.firmId, firmId)));
      if (!linkedEngagement) throw new ApiError(403, "FORBIDDEN", "Engagement boundary violation");
      if (clientId && linkedEngagement.clientId !== Number(clientId)) throw new ApiError(400, "VALIDATION_ERROR", "Engagement does not belong to client");
    }
    if (taskId) {
      const [task] = await db.select().from(tasks).where(and(eq(tasks.id, Number(taskId)), eq(tasks.firmId, firmId)));
      if (!task) throw new ApiError(403, "FORBIDDEN", "Task boundary violation");
      if (clientId && task.clientId && task.clientId !== Number(clientId)) throw new ApiError(400, "VALIDATION_ERROR", "Task does not belong to client");
      if (engagementId && task.engagementId && task.engagementId !== Number(engagementId)) throw new ApiError(400, "VALIDATION_ERROR", "Task does not belong to engagement");
      if (task.engagementId && clientId && !engagementId) {
        const [taskEngagement] = await db.select().from(engagements).where(and(eq(engagements.id, task.engagementId), eq(engagements.firmId, firmId)));
        if (!taskEngagement || taskEngagement.clientId !== Number(clientId)) throw new ApiError(400, "VALIDATION_ERROR", "Task engagement does not belong to client");
      }
    }

    const [sheet] = await db.insert(timesheets).values({
      firmId,
      userId,
      date: new Date(date),
      durationHours,
      clientId: clientId || null,
      engagementId: engagementId || null,
      taskId: taskId || null,
      status: "draft"
    }).returning();

    res.status(201).json({ success: true, data: sheet });
  } catch (error) {
    next(error);
  }
};

export const updateTimesheet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const timesheetId = parseInt(req.params.id as string, 10);
    const { durationHours, status } = req.body;

    const [existing] = await db.select().from(timesheets).where(and(eq(timesheets.id, timesheetId), eq(timesheets.firmId, firmId)));
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Timesheet not found");
    const canApprove = !!req.firmRole && hasPermission(req.firmRole, "timesheets:approve");
    if (!canApprove && existing.userId !== req.user!.id) throw new ApiError(403, "FORBIDDEN", "Cannot update another user's timesheet");

    const [sheet] = await db.update(timesheets)
      .set({ durationHours, status, updatedAt: new Date() })
      .where(and(eq(timesheets.id, timesheetId), eq(timesheets.firmId, firmId)))
      .returning();

    if (!sheet) throw new ApiError(404, "NOT_FOUND", "Timesheet not found");
    res.json({ success: true, data: sheet });
  } catch (error) {
    next(error);
  }
};

export const deleteTimesheet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const timesheetId = parseInt(req.params.id as string, 10);

    const [existing] = await db.select().from(timesheets).where(and(eq(timesheets.id, timesheetId), eq(timesheets.firmId, firmId)));
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Timesheet not found");
    const canApprove = !!req.firmRole && hasPermission(req.firmRole, "timesheets:approve");
    if (!canApprove && existing.userId !== req.user!.id) throw new ApiError(403, "FORBIDDEN", "Cannot delete another user's timesheet");

    const [sheet] = await db.delete(timesheets)
      .where(and(eq(timesheets.id, timesheetId), eq(timesheets.firmId, firmId)))
      .returning();

    if (!sheet) throw new ApiError(404, "NOT_FOUND", "Timesheet not found");
    res.json({ success: true, data: sheet });
  } catch (error) {
    next(error);
  }
};

// NOTIFICATIONS
export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const userId = req.user!.id;
    const list = await db.select().from(notifications).where(and(eq(notifications.firmId, firmId), eq(notifications.userId, userId)));
    res.json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
};

export const getUnreadCount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const userId = req.user!.id;
    const [result] = await db.select({ count: count() }).from(notifications)
      .where(and(eq(notifications.firmId, firmId), eq(notifications.userId, userId), eq(notifications.isRead, false)));
    res.json({ success: true, data: { count: Number(result.count) } });
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const userId = req.user!.id;
    const notificationId = parseInt(req.params.id as string, 10);

    const [notif] = await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, notificationId), eq(notifications.firmId, firmId), eq(notifications.userId, userId)))
      .returning();

    if (!notif) throw new ApiError(404, "NOT_FOUND", "Notification not found");
    res.json({ success: true, data: notif });
  } catch (error) {
    next(error);
  }
};

export const markAllAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const userId = req.user!.id;

    await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.firmId, firmId), eq(notifications.userId, userId), eq(notifications.isRead, false)));

    res.json({ success: true, data: { message: "All marked as read" } });
  } catch (error) {
    next(error);
  }
};
