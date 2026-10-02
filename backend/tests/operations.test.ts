import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { db, pool } from "../src/db";
import { users, firms, firmUsers, tasks, timesheets, notifications, clients, engagements } from "../src/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

describe("Operations APIs (B06)", () => {
  let firmACookie: string;
  let firmAStaffCookie: string;
  let firmBCookie: string;

  let firmAId: number;
  let firmBId: number;
  let userAId: number;
  let userAStaffId: number;
  let userBId: number;

  let taskId: number;
  let timesheetId: number;
  let ownerTimesheetId: number;
  let firmBClientId: number;
  let firmBEngagementId: number;
  let firmBTaskId: number;

  beforeAll(async () => {
    const pwHash = await bcrypt.hash("password123", 10);

    // Create Firms
    const [fa] = await db.insert(firms).values({ name: "Op Firm A", subdomain: "op-firma" }).returning();
    const [fb] = await db.insert(firms).values({ name: "Op Firm B", subdomain: "op-firmb" }).returning();
    firmAId = fa.id;
    firmBId = fb.id;

    // Create Users
    const [userA] = await db.insert(users).values({ email: "op-owner@firma.com", passwordHash: pwHash }).returning();
    const [userAStaff] = await db.insert(users).values({ email: "op-staff@firma.com", passwordHash: pwHash }).returning();
    const [userB] = await db.insert(users).values({ email: "op-owner@firmb.com", passwordHash: pwHash }).returning();

    userAId = userA.id;
    userAStaffId = userAStaff.id;
    userBId = userB.id;

    // Assign Roles
    await db.insert(firmUsers).values([
      { userId: userAId, firmId: firmAId, role: "FIRM_OWNER" },
      { userId: userAStaffId, firmId: firmAId, role: "STAFF" },
      { userId: userBId, firmId: firmBId, role: "FIRM_OWNER" }
    ]);

    const [clientB] = await db.insert(clients).values({ firmId: firmBId, name: "Op Client B" }).returning();
    firmBClientId = clientB.id;
    const [engagementB] = await db.insert(engagements).values({ firmId: firmBId, clientId: firmBClientId, name: "Op Engagement B" }).returning();
    firmBEngagementId = engagementB.id;
    const [taskB] = await db.insert(tasks).values({ firmId: firmBId, creatorId: userBId, clientId: firmBClientId, engagementId: firmBEngagementId, title: "Firm B task" }).returning();
    firmBTaskId = taskB.id;

    // Seed a notification for userA
    await db.insert(notifications).values({
      firmId: firmAId,
      userId: userAId,
      message: "Test Notification",
      isRead: false
    });

    const login = async (email: string) => {
      const res = await request(app).post("/api/v1/auth/login").send({ email, password: "password123" });
      return res.headers["set-cookie"][0];
    };

    firmACookie = await login("op-owner@firma.com");
    firmAStaffCookie = await login("op-staff@firma.com");
    firmBCookie = await login("op-owner@firmb.com");
  });

  afterAll(async () => {
    await db.delete(notifications);
    await db.delete(timesheets);
    await db.delete(tasks);
    await db.delete(engagements);
    await db.delete(clients);
    await db.delete(firmUsers).where(eq(firmUsers.firmId, firmAId));
    await db.delete(firmUsers).where(eq(firmUsers.firmId, firmBId));
    await db.delete(users).where(eq(users.email, "op-owner@firma.com"));
    await db.delete(users).where(eq(users.email, "op-staff@firma.com"));
    await db.delete(users).where(eq(users.email, "op-owner@firmb.com"));
    await db.delete(firms).where(eq(firms.id, firmAId));
    await db.delete(firms).where(eq(firms.id, firmBId));
    await pool.end();
  });

  // TASKS
  it("should allow authorized user to create a task", async () => {
    const res = await request(app)
      .post("/api/v1/tasks")
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString())
      .send({ title: "Annual Audit Review", assigneeId: userAStaffId });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe("Annual Audit Review");
    taskId = res.body.data.id;
  });

  it("should allow assigned user to view task", async () => {
    const res = await request(app)
      .get(`/api/v1/tasks/${taskId}`)
      .set("Cookie", firmAStaffCookie)
      .set("X-Firm-Id", firmAId.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(taskId);
  });

  it("should prevent Firm B from accessing Firm A task", async () => {
    const res = await request(app)
      .get(`/api/v1/tasks/${taskId}`)
      .set("Cookie", firmBCookie)
      .set("X-Firm-Id", firmBId.toString());

    expect(res.status).toBe(404);
  });

  // TIMESHEETS
  it("should allow user to create a timesheet entry", async () => {
    const res = await request(app)
      .post("/api/v1/timesheets")
      .set("Cookie", firmAStaffCookie)
      .set("X-Firm-Id", firmAId.toString())
      .send({ date: new Date().toISOString(), durationHours: 4 });

    expect(res.status).toBe(201);
    expect(res.body.data.durationHours).toBe(4);
    timesheetId = res.body.data.id;
  });

  it("should prevent Firm B from editing Firm A timesheet", async () => {
    const res = await request(app)
      .patch(`/api/v1/timesheets/${timesheetId}`)
      .set("Cookie", firmBCookie)
      .set("X-Firm-Id", firmBId.toString())
      .send({ durationHours: 8 });

    expect(res.status).toBe(404);
  });


  it("should restrict staff timesheet reads and mutations to their own records", async () => {
    const createOwner = await request(app)
      .post("/api/v1/timesheets")
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString())
      .send({ date: new Date().toISOString(), durationHours: 2 });
    expect(createOwner.status).toBe(201);
    ownerTimesheetId = createOwner.body.data.id;

    const listRes = await request(app)
      .get("/api/v1/timesheets")
      .set("Cookie", firmAStaffCookie)
      .set("X-Firm-Id", firmAId.toString());
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.every((row: any) => row.userId === userAStaffId)).toBe(true);

    const getRes = await request(app)
      .get(`/api/v1/timesheets/${ownerTimesheetId}`)
      .set("Cookie", firmAStaffCookie)
      .set("X-Firm-Id", firmAId.toString());
    expect(getRes.status).toBe(403);

    const updateRes = await request(app)
      .patch(`/api/v1/timesheets/${ownerTimesheetId}`)
      .set("Cookie", firmAStaffCookie)
      .set("X-Firm-Id", firmAId.toString())
      .send({ durationHours: 9 });
    expect(updateRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/v1/timesheets/${ownerTimesheetId}`)
      .set("Cookie", firmAStaffCookie)
      .set("X-Firm-Id", firmAId.toString());
    expect(deleteRes.status).toBe(403);
  });

  it("should allow a timesheet approver to update another user's record", async () => {
    const res = await request(app)
      .patch(`/api/v1/timesheets/${timesheetId}`)
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString())
      .send({ durationHours: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data.durationHours).toBe(5);
  });

  it("should reject cross-firm timesheet linked resources", async () => {
    for (const payload of [
      { clientId: firmBClientId },
      { engagementId: firmBEngagementId },
      { taskId: firmBTaskId }
    ]) {
      const res = await request(app)
        .post("/api/v1/timesheets")
        .set("Cookie", firmAStaffCookie)
        .set("X-Firm-Id", firmAId.toString())
        .send({ date: new Date().toISOString(), durationHours: 1, ...payload });
      expect(res.status).toBe(403);
    }
  });

  // NOTIFICATIONS
  it("should allow user to view unread count", async () => {
    const res = await request(app)
      .get("/api/v1/notifications/unread-count")
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(1);
  });

  it("should allow user to mark all as read", async () => {
    const res = await request(app)
      .post("/api/v1/notifications/mark-all-read")
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString());

    expect(res.status).toBe(200);

    const countRes = await request(app)
      .get("/api/v1/notifications/unread-count")
      .set("Cookie", firmACookie)
      .set("X-Firm-Id", firmAId.toString());

    expect(countRes.body.data.count).toBe(0);
  });
});
