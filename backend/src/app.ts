import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { errorHandler, ApiError } from "./middlewares/errorHandler";
import { requestLogger } from "./middlewares/logger";
import healthRouter from "./routes/health";
import authRouter from "./routes/auth/auth.routes";

import adminRouter from "./routes/admin/admin.routes";
import practiceRouter from "./routes/practice/practice.routes";
import operationsRouter from "./routes/operations/operations.routes";
import vaultRouter from "./routes/vault/vault.routes";
import financeRouter from "./routes/finance/finance.routes";
import publicRouter from "./routes/public/public.routes";
import coreRouter from "./routes/core/core.routes";
import controlAccessRequestsRouter from "./routes/control/accessRequests.routes";
import controlCreditsRouter from "./routes/control/credits.routes";
import controlGovernanceRouter from "./routes/control/governance.routes";
import controlAuditRouter from "./routes/control/audit.routes";
import controlChatbotRouter from "./routes/control/chatbot.routes";
import creditsRouter from "./routes/credits/credits.routes";
import internalProvisioningRouter from "./routes/internal/provisioning.routes";

const app = express();

// Security and utility middlewares
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());
app.use(requestLogger);

// CORS configuration (no wildcard)
app.use(
  cors({
    origin: [...env.CORS_ORIGIN_FRONTEND, env.CORS_ORIGIN_CONTROL_PANEL],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Client-Application', 'X-Firm-Id', 'X-Correlation-Id'],
    exposedHeaders: ['Set-Cookie', 'X-Correlation-Id', 'X-Request-Id'],
  })
);

// API Routes
app.use("/api/v1/public", publicRouter);
app.use("/api/v1/internal", internalProvisioningRouter);
app.use("/api/v1/control", controlAccessRequestsRouter);
app.use("/api/v1/control", controlCreditsRouter);
app.use("/api/v1/control", controlGovernanceRouter);
app.use("/api/v1/control", controlAuditRouter);
app.use("/api/v1/control", controlChatbotRouter);
app.use("/api/v1", healthRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1", practiceRouter);
app.use("/api/v1", operationsRouter);
app.use("/api/v1", vaultRouter);
app.use("/api/v1", financeRouter);
app.use("/api/v1", coreRouter);
app.use("/api/v1", creditsRouter);

// Handle 404
app.use((req, res, next) => {
  next(new ApiError(404, "NOT_FOUND", "Route not found"));
});

// Centralized error handling
app.use(errorHandler);

export { app };
