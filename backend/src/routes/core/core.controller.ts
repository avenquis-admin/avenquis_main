import { Request, Response, NextFunction } from "express";
import { db } from "../../db";
import {
  peopleProfiles, attendanceRecords, performanceReviews, payrollRecords,
  calendarEvents, clientPortalAccess, documentRequests,
  clients, engagements, tasks, workingPapers, documents, timesheets,
  notifications, practiceInvoices, practicePayments, firmUsers, users
} from "../../db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { ApiError } from "../../middlewares/errorHandler";
import { assistWithLocalBrain } from "../../services/chatbot";
import type { ChatbotProviderMode } from "../../services/chatbotProviders";

const asInt = (value: unknown, label: string) => {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new ApiError(400, "VALIDATION_ERROR", `${label} must be an integer`);
  return n;
};

const asOptionalPositiveInt = (value: unknown, label: string) => {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, "VALIDATION_ERROR", `${label} must be a positive integer`);
  return n;
};

// PEOPLE
export const getPeople = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db.select().from(peopleProfiles).where(eq(peopleProfiles.firmId, req.firm!.id));
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
};

export const getPerson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = asInt(req.params.id, "id");
    const [row] = await db.select().from(peopleProfiles).where(and(eq(peopleProfiles.id, id), eq(peopleProfiles.firmId, req.firm!.id)));
    if (!row) throw new ApiError(404, "NOT_FOUND", "Person not found");
    res.json({ success: true, data: row });
  } catch (e) { next(e); }
};

export const createPerson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, employeeCode, fullName, type, designation, department, reportingManagerId, phone, joiningDate, status } = req.body;
    if (!fullName) throw new ApiError(400, "VALIDATION_ERROR", "fullName is required");
    if (userId) {
      const [member] = await db.select().from(firmUsers).where(and(eq(firmUsers.firmId, req.firm!.id), eq(firmUsers.userId, Number(userId))));
      if (!member) throw new ApiError(403, "FORBIDDEN", "User is not a member of this firm");
    }
    const [row] = await db.insert(peopleProfiles).values({
      firmId: req.firm!.id, userId: userId || null, employeeCode: employeeCode || null, fullName,
      type: type || "STAFF", designation: designation || null, department: department || null,
      reportingManagerId: reportingManagerId || null, phone: phone || null,
      joiningDate: joiningDate ? new Date(joiningDate) : null, status: status || "ACTIVE"
    }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (e) { next(e); }
};

export const updatePerson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = asInt(req.params.id, "id");
    const allowed: any = {};
    for (const k of ["employeeCode","fullName","type","designation","department","phone","status"] as const) if (req.body[k] !== undefined) allowed[k] = req.body[k];
    if (req.body.reportingManagerId !== undefined) allowed.reportingManagerId = req.body.reportingManagerId || null;
    if (req.body.joiningDate !== undefined) allowed.joiningDate = req.body.joiningDate ? new Date(req.body.joiningDate) : null;
    allowed.updatedAt = new Date();
    const [row] = await db.update(peopleProfiles).set(allowed).where(and(eq(peopleProfiles.id, id), eq(peopleProfiles.firmId, req.firm!.id))).returning();
    if (!row) throw new ApiError(404, "NOT_FOUND", "Person not found");
    res.json({ success: true, data: row });
  } catch (e) { next(e); }
};

// ATTENDANCE
export const getAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conditions: any[] = [eq(attendanceRecords.firmId, req.firm!.id)];
    if (req.query.userId) conditions.push(eq(attendanceRecords.userId, asInt(req.query.userId, "userId")));
    if (req.query.from) conditions.push(gte(attendanceRecords.date, new Date(String(req.query.from))));
    if (req.query.to) conditions.push(lte(attendanceRecords.date, new Date(String(req.query.to))));
    const rows = await db.select().from(attendanceRecords).where(and(...conditions));
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
};

export const createAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, date, checkIn, checkOut, status, location, notes } = req.body;
    if (!userId || !date) throw new ApiError(400, "VALIDATION_ERROR", "userId and date are required");
    const [member] = await db.select().from(firmUsers).where(and(eq(firmUsers.firmId, req.firm!.id), eq(firmUsers.userId, Number(userId))));
    if (!member) throw new ApiError(403, "FORBIDDEN", "User is not a member of this firm");
    const [row] = await db.insert(attendanceRecords).values({ firmId: req.firm!.id, userId: Number(userId), date: new Date(date), checkIn: checkIn ? new Date(checkIn) : null, checkOut: checkOut ? new Date(checkOut) : null, status: status || "PRESENT", location: location || null, notes: notes || null }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (e) { next(e); }
};

export const updateAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = asInt(req.params.id, "id");
    const patch: any = { updatedAt: new Date() };
    for (const k of ["status","location","notes"] as const) if (req.body[k] !== undefined) patch[k] = req.body[k];
    if (req.body.checkIn !== undefined) patch.checkIn = req.body.checkIn ? new Date(req.body.checkIn) : null;
    if (req.body.checkOut !== undefined) patch.checkOut = req.body.checkOut ? new Date(req.body.checkOut) : null;
    const [row] = await db.update(attendanceRecords).set(patch).where(and(eq(attendanceRecords.id, id), eq(attendanceRecords.firmId, req.firm!.id))).returning();
    if (!row) throw new ApiError(404, "NOT_FOUND", "Attendance record not found");
    res.json({ success: true, data: row });
  } catch (e) { next(e); }
};

// PERFORMANCE
export const getPerformance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conditions: any[] = [eq(performanceReviews.firmId, req.firm!.id)];
    if (req.query.userId) conditions.push(eq(performanceReviews.userId, asInt(req.query.userId, "userId")));
    const rows = await db.select().from(performanceReviews).where(and(...conditions));
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
};

export const createPerformance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, cycle, technicalQuality, documentationQuality, timeliness, teamwork, feedback, status } = req.body;
    if (!userId || !cycle) throw new ApiError(400, "VALIDATION_ERROR", "userId and cycle are required");
    const [row] = await db.insert(performanceReviews).values({ firmId: req.firm!.id, userId: Number(userId), reviewerId: req.user!.id, cycle, technicalQuality: technicalQuality ?? null, documentationQuality: documentationQuality ?? null, timeliness: timeliness ?? null, teamwork: teamwork ?? null, feedback: feedback || null, status: status || "DRAFT" }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (e) { next(e); }
};

export const updatePerformance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = asInt(req.params.id, "id");
    const patch: any = { updatedAt: new Date() };
    for (const k of ["cycle","technicalQuality","documentationQuality","timeliness","teamwork","feedback","status"] as const) if (req.body[k] !== undefined) patch[k] = req.body[k];
    const [row] = await db.update(performanceReviews).set(patch).where(and(eq(performanceReviews.id, id), eq(performanceReviews.firmId, req.firm!.id))).returning();
    if (!row) throw new ApiError(404, "NOT_FOUND", "Performance review not found");
    res.json({ success: true, data: row });
  } catch (e) { next(e); }
};

// PAYROLL / ALLOWANCE BASIC
export const getPayroll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conditions: any[] = [eq(payrollRecords.firmId, req.firm!.id)];
    if (req.query.userId) conditions.push(eq(payrollRecords.userId, asInt(req.query.userId, "userId")));
    if (req.query.period) conditions.push(eq(payrollRecords.period, String(req.query.period)));
    const rows = await db.select().from(payrollRecords).where(and(...conditions));
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
};

export const createPayroll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, period, grossAmount, allowanceAmount, deductionAmount, netAmount, status } = req.body;
    if (!userId || !period || grossAmount === undefined || netAmount === undefined) throw new ApiError(400, "VALIDATION_ERROR", "userId, period, grossAmount and netAmount are required");
    const [row] = await db.insert(payrollRecords).values({ firmId: req.firm!.id, userId: Number(userId), period, grossAmount: String(grossAmount), allowanceAmount: String(allowanceAmount ?? "0.00"), deductionAmount: String(deductionAmount ?? "0.00"), netAmount: String(netAmount), status: status || "DRAFT" }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (e) { next(e); }
};

export const updatePayroll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = asInt(req.params.id, "id");
    const patch: any = { updatedAt: new Date() };
    for (const k of ["period","grossAmount","allowanceAmount","deductionAmount","netAmount","status"] as const) if (req.body[k] !== undefined) patch[k] = String(req.body[k]);
    const [row] = await db.update(payrollRecords).set(patch).where(and(eq(payrollRecords.id, id), eq(payrollRecords.firmId, req.firm!.id))).returning();
    if (!row) throw new ApiError(404, "NOT_FOUND", "Payroll record not found");
    res.json({ success: true, data: row });
  } catch (e) { next(e); }
};

// CALENDAR
export const getCalendar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const events = await db.select().from(calendarEvents).where(eq(calendarEvents.firmId, firmId));
    const taskRows = await db.select().from(tasks).where(eq(tasks.firmId, firmId));
    const taskEvents = taskRows.filter(t => t.dueDate).map(t => ({ id: `task-${t.id}`, source: "task", title: t.title, eventType: "TASK_DUE", startsAt: t.dueDate, endsAt: null, clientId: t.clientId, engagementId: t.engagementId, assignedUserId: t.assigneeId, notes: null }));
    res.json({ success: true, data: [...events.map(e => ({ ...e, source: "calendar" })), ...taskEvents] });
  } catch (e) { next(e); }
};

export const createCalendarEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, eventType, startsAt, endsAt, clientId, engagementId, assignedUserId, notes } = req.body;
    if (!title || !startsAt) throw new ApiError(400, "VALIDATION_ERROR", "title and startsAt are required");
    const [row] = await db.insert(calendarEvents).values({ firmId: req.firm!.id, title, eventType: eventType || "GENERAL", startsAt: new Date(startsAt), endsAt: endsAt ? new Date(endsAt) : null, clientId: clientId || null, engagementId: engagementId || null, assignedUserId: assignedUserId || null, notes: notes || null }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (e) { next(e); }
};

// REPORTS / DASHBOARD
export const getReportSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const [cs, es, ts, wps, tss, invs, pays] = await Promise.all([
      db.select().from(clients).where(eq(clients.firmId, firmId)),
      db.select().from(engagements).where(eq(engagements.firmId, firmId)),
      db.select().from(tasks).where(eq(tasks.firmId, firmId)),
      db.select().from(workingPapers).where(eq(workingPapers.firmId, firmId)),
      db.select().from(timesheets).where(eq(timesheets.firmId, firmId)),
      db.select().from(practiceInvoices).where(eq(practiceInvoices.firmId, firmId)),
      db.select().from(practicePayments).where(eq(practicePayments.firmId, firmId)),
    ]);
    const money = (v: string | null | undefined) => Number(v || 0);
    res.json({ success: true, data: {
      clients: { total: cs.length, active: cs.filter(c => !c.isArchived && c.status === "active").length, archived: cs.filter(c => c.isArchived).length },
      engagements: { total: es.length, active: es.filter(e => !e.isArchived && e.status !== "completed").length, completed: es.filter(e => e.status === "completed").length },
      tasks: { total: ts.length, overdue: ts.filter(t => t.dueDate && t.dueDate < new Date() && t.status !== "done").length, open: ts.filter(t => t.status !== "done").length },
      workingPapers: { total: wps.length, inReview: wps.filter(w => w.status === "in_review").length, signedOff: wps.filter(w => w.status === "signed_off").length },
      timesheets: { entries: tss.length, hours: tss.reduce((a, b) => a + Number(b.durationHours || 0), 0) },
      billing: { invoiced: invs.reduce((a, b) => a + money(b.totalAmount), 0), collected: pays.reduce((a, b) => a + money(b.amount), 0) }
    }});
  } catch (e) { next(e); }
};

export const getDashboardSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firmId = req.firm!.id;
    const [es, ts, wps, docs, notifs] = await Promise.all([
      db.select().from(engagements).where(eq(engagements.firmId, firmId)),
      db.select().from(tasks).where(eq(tasks.firmId, firmId)),
      db.select().from(workingPapers).where(eq(workingPapers.firmId, firmId)),
      db.select().from(documents).where(eq(documents.firmId, firmId)),
      db.select().from(notifications).where(and(eq(notifications.firmId, firmId), eq(notifications.userId, req.user!.id))),
    ]);
    res.json({ success: true, data: {
      activeEngagements: es.filter(e => !e.isArchived && e.status !== "completed").length,
      pendingReviews: wps.filter(w => w.status === "in_review").length,
      overdueTasks: ts.filter(t => t.dueDate && t.dueDate < new Date() && t.status !== "done").length,
      upcomingDeadlines: ts.filter(t => t.dueDate && t.dueDate >= new Date() && t.status !== "done").sort((a,b) => (a.dueDate!.getTime()-b.dueDate!.getTime())).slice(0,10),
      documentCount: docs.filter(d => !d.isArchived).length,
      unreadNotifications: notifs.filter(n => !n.isRead).length,
    }});
  } catch (e) { next(e); }
};

// CLIENT PORTAL BASIC
export const getPortalAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db.select().from(clientPortalAccess).where(eq(clientPortalAccess.firmId, req.firm!.id));
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
};

export const createPortalAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientId, userId } = req.body;
    if (!clientId || !userId) throw new ApiError(400, "VALIDATION_ERROR", "clientId and userId are required");
    const [client] = await db.select().from(clients).where(and(eq(clients.id, Number(clientId)), eq(clients.firmId, req.firm!.id)));
    if (!client) throw new ApiError(404, "NOT_FOUND", "Client not found");
    const [member] = await db.select().from(firmUsers).where(and(eq(firmUsers.userId, Number(userId)), eq(firmUsers.firmId, req.firm!.id)));
    if (!member || member.role !== "CLIENT") throw new ApiError(400, "VALIDATION_ERROR", "Portal user must be a CLIENT firm member");
    const [row] = await db.insert(clientPortalAccess).values({ firmId: req.firm!.id, clientId: Number(clientId), userId: Number(userId), status: "ACTIVE", activatedAt: new Date() }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (e) { next(e); }
};

export const updatePortalAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = asInt(req.params.id, "id");
    const status = String(req.body.status || "").toUpperCase();
    if (!status) throw new ApiError(400, "VALIDATION_ERROR", "status is required");
    const patch: any = { status };
    if (status === "ACTIVE") patch.activatedAt = new Date();
    if (status === "REVOKED") patch.revokedAt = new Date();
    const [row] = await db.update(clientPortalAccess).set(patch).where(and(eq(clientPortalAccess.id, id), eq(clientPortalAccess.firmId, req.firm!.id))).returning();
    if (!row) throw new ApiError(404, "NOT_FOUND", "Portal access not found");
    res.json({ success: true, data: row });
  } catch (e) { next(e); }
};

export const getDocumentRequests = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let rows = await db.select().from(documentRequests).where(eq(documentRequests.firmId, req.firm!.id));
    if (req.firmRole === "CLIENT") {
      const access = await db.select().from(clientPortalAccess).where(and(eq(clientPortalAccess.firmId, req.firm!.id), eq(clientPortalAccess.userId, req.user!.id), eq(clientPortalAccess.status, "ACTIVE")));
      const allowedClients = new Set(access.map(a => a.clientId));
      rows = rows.filter(r => allowedClients.has(r.clientId));
    }
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
};

export const createDocumentRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientId, engagementId, title, description, dueDate } = req.body;
    if (!clientId || !title) throw new ApiError(400, "VALIDATION_ERROR", "clientId and title are required");
    const [client] = await db.select().from(clients).where(and(eq(clients.id, Number(clientId)), eq(clients.firmId, req.firm!.id)));
    if (!client) throw new ApiError(404, "NOT_FOUND", "Client not found");
    const [row] = await db.insert(documentRequests).values({ firmId: req.firm!.id, clientId: Number(clientId), engagementId: engagementId || null, title, description: description || null, dueDate: dueDate ? new Date(dueDate) : null, createdById: req.user!.id }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (e) { next(e); }
};

export const updateDocumentRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = asInt(req.params.id, "id");
    const patch: any = { updatedAt: new Date() };
    for (const k of ["title","description","status"] as const) if (req.body[k] !== undefined) patch[k] = req.body[k];
    if (req.body.dueDate !== undefined) patch.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
    const [row] = await db.update(documentRequests).set(patch).where(and(eq(documentRequests.id, id), eq(documentRequests.firmId, req.firm!.id))).returning();
    if (!row) throw new ApiError(404, "NOT_FOUND", "Document request not found");
    res.json({ success: true, data: row });
  } catch (e) { next(e); }
};

// X7 governed local-first assistant. PET remains disabled and external calls are backend-only.
export const aiAssist = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prompt, context, clientId, engagementId, userScoped, idempotencyKey, providerMode } = req.body;
    if (!prompt || typeof prompt !== "string") throw new ApiError(400, "VALIDATION_ERROR", "prompt is required");
    const allowedProviderModes: ChatbotProviderMode[] = ["LOCAL_BRAIN", "GROQ", "PET_FUTURE"];
    if (providerMode !== undefined && !allowedProviderModes.includes(providerMode)) {
      throw new ApiError(400, "VALIDATION_ERROR", "providerMode must be LOCAL_BRAIN, GROQ, or PET_FUTURE");
    }
    const result = await assistWithLocalBrain({
      userId: req.user!.id, firmId: req.firm?.id, firmRole: req.firmRole || "INDIVIDUAL", prompt,
      clientId: asOptionalPositiveInt(clientId ?? context?.clientId, "clientId"),
      engagementId: asOptionalPositiveInt(engagementId ?? context?.engagementId, "engagementId"),
      userScoped: userScoped === true,
      idempotencyKey: String(idempotencyKey || req.header("Idempotency-Key") || req.id),
      correlationId: req.id,
      requestedProviderMode: providerMode as ChatbotProviderMode | undefined,
    });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
};
