import { describe, expect, it } from "vitest";
import { envSchema } from "../src/config/env";
import { createConfiguredEmailTransport, SmtpEmailTransport } from "../src/services/email";
import { generateTemporaryPassword } from "../src/services/temporaryPassword";

const baseEnv = { DATABASE_URL: "postgresql://user:pass@localhost:5432/test", JWT_SECRET: "a-secret-longer-than-sixteen" };

describe("temporary credential infrastructure", () => {
  it("generates unique policy-compliant temporary passwords", () => {
    const values = new Set(Array.from({ length: 50 }, () => generateTemporaryPassword()));
    expect(values.size).toBe(50);
    for (const value of values) {
      expect(value.length).toBeGreaterThanOrEqual(12);
      expect(value).toMatch(/[A-Z]/);
      expect(value).toMatch(/[a-z]/);
      expect(value).toMatch(/[0-9]/);
      expect(value).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it("rejects incomplete SMTP configuration", () => {
    expect(envSchema.safeParse({ ...baseEnv, EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.gmail.com" }).success).toBe(false);
  });

  it("selects SMTP for a complete SMTP configuration", () => {
    const config = envSchema.parse({
      ...baseEnv, EMAIL_PROVIDER: "smtp", EMAIL_FROM: "sender@example.test", SMTP_HOST: "smtp.gmail.com",
      SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "sender@example.test", SMTP_PASS: "app-password",
    });
    const transport = createConfiguredEmailTransport(config);
    expect(transport).toBeInstanceOf(SmtpEmailTransport);
  });
});
