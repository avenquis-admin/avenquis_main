import { app } from "./app";
import { env } from "./config/env";
import { pool } from "./db";

const server = app.listen(env.PORT, () => {
  console.log(`ðŸš€ Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});

const gracefulShutdown = async () => {
  console.log("Shutting down gracefully...");

  server.close(async () => {
    console.log("HTTP server closed.");
    try {
      await pool.end();
      console.log("Database connection pool closed.");
      process.exit(0);
    } catch (err) {
      console.error("Error during database disconnection", err);
      process.exit(1);
    }
  });

  // Force shutdown after 10s
  setTimeout(() => {
    console.error("Could not close connections in time, forcefully shutting down");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
