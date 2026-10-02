import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { db, pool } from "../src/db";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

describe("Auth API", () => {
  const testEmail = "test@avenquis.com";
  const testPassword = "password123";

  beforeAll(async () => {
    // Ensure user doesn't exist then create it
    await db.delete(users).where(eq(users.email, testEmail));
    const passwordHash = await bcrypt.hash(testPassword, 10);
    await db.insert(users).values({ email: testEmail, passwordHash });
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, testEmail));
    await pool.end();
  });

  let authCookie: string;

  it("should fail with invalid password", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testEmail, password: "wrongpassword" });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("should fail with nonexistent user", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "notfound@avenquis.com", password: "password123" });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("should succeed with valid login and set HttpOnly cookie", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testEmail, password: testPassword });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.email).toBe(testEmail);

    const cookies = response.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain("avenquis_session=");
    expect(cookies[0]).toContain("HttpOnly");

    authCookie = cookies[0];
  });

  it("should reject /auth/me without cookie", async () => {
    const response = await request(app).get("/api/v1/auth/me");
    expect(response.status).toBe(401);
  });

  it("should return user info on /auth/me with valid cookie", async () => {
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", authCookie);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.email).toBe(testEmail);
  });

  it("should clear cookie on logout", async () => {
    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", authCookie);

    expect(response.status).toBe(200);

    const cookies = response.headers["set-cookie"];
    expect(cookies).toBeDefined();
    // Cookie should be cleared by setting an expiry in the past
    expect(cookies[0]).toContain("avenquis_session=;");
  });
});
