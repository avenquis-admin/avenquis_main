import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8101),
  DATABASE_URL: z.string().url("Must be a valid PostgreSQL connection URL"),
  CORS_ORIGIN_FRONTEND: z.string().default("http://localhost:3101").transform((val) => val.split(',').map(s => s.trim()).filter(Boolean)).refine((urls) => {
    return urls.every(u => {
      try { new URL(u); return true; } catch { return false; }
    });
  }, "Every origin in CORS_ORIGIN_FRONTEND must be a valid URL"),
  CORS_ORIGIN_CONTROL_PANEL: z.string().url().default("http://localhost:4000"),
  JWT_SECRET: z.string().min(16),
  // Backend-only credential used by the Control Platform to access Core-owned contracts.
  CONTROL_SERVICE_TOKEN: z.string().min(32).optional(),
  INDIVIDUAL_INITIAL_CREDITS: z.coerce.number().int().min(0).default(1000),
  FIRM_INITIAL_CREDITS: z.coerce.number().int().min(0).default(5000),
  ACTIVATION_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  EMAIL_PROVIDER: z.enum(["memory", "http", "smtp"]).default("memory"),
  EMAIL_API_URL: z.string().url().optional(),
  EMAIL_API_KEY: z.string().min(16).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().default("no-reply@avenquis.example"),
  EMAIL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  CORE_FRONTEND_URL: z.string().url().default("http://localhost:3101"),
  SUPPORT_EMAIL: z.string().email().default("support@avenquis.example"),
  // PET configuration
  PET_PROVIDER: z.enum(["mock", "gemini", "openai"]).default("mock"),
  PET_API_KEY: z.string().optional(),
  PET_MODEL: z.string().optional(),
  PET_RATE_LIMIT: z.coerce.number().default(60),
  GROQ_API_KEY: z.string().min(16).optional(),
  GROQ_API_URL: z.string().url().default("https://api.groq.com/openai/v1/chat/completions"),
  GROQ_MODEL: z.string().min(1).default("llama-3.3-70b-versatile"),
  GROQ_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
  CHATBOT_LOCAL_CREDITS: z.coerce.number().int().min(0).default(1),
  CHATBOT_AI_STANDARD_CREDITS: z.coerce.number().int().positive().default(10),
  CHATBOT_AI_HEAVY_CREDITS: z.coerce.number().int().positive().default(25),
  CHATBOT_LOCAL_SIMILARITY_THRESHOLD: z.coerce.number().min(0.5).max(1).default(0.72),
  // NOTE: FRONTEND_URL and CONTROL_PANEL_URL are deprecated and removed.
}).superRefine((config, context) => {
  if (config.EMAIL_PROVIDER !== "smtp") return;

  const requiredSmtpFields = [
    ["SMTP_HOST", config.SMTP_HOST],
    ["SMTP_PORT", config.SMTP_PORT],
    ["SMTP_USER", config.SMTP_USER],
    ["SMTP_PASS", config.SMTP_PASS],
    ["EMAIL_FROM", config.EMAIL_FROM],
  ] as const;

  for (const [field, value] of requiredSmtpFields) {
    if (value === undefined || value === "") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} is required when EMAIL_PROVIDER is smtp.`,
      });
    }
  }
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("âŒ Invalid environment variables:", _env.error.format());
  process.exit(1);
}

if (_env.success && _env.data.NODE_ENV === "production" && !_env.data.CONTROL_SERVICE_TOKEN) {
  console.error("âŒ CONTROL_SERVICE_TOKEN is required in production.");
  process.exit(1);
}

if (_env.success && _env.data.NODE_ENV === "production" && (
  (_env.data.EMAIL_PROVIDER === "http" && (!_env.data.EMAIL_API_URL || !_env.data.EMAIL_API_KEY)) ||
  (_env.data.EMAIL_PROVIDER === "smtp" && (!_env.data.SMTP_HOST || !_env.data.SMTP_PORT)) ||
  _env.data.EMAIL_PROVIDER === "memory"
)) {
  console.error("âŒ Production requires EMAIL_PROVIDER=http (with API config) or smtp (with SMTP config).");
  process.exit(1);
}

export const env = _env.data;
