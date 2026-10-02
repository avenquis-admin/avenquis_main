import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/health", async (req, res, next) => {
  try {
    // Test database connection
    await db.execute(sql`SELECT 1`);

    res.json({
      success: true,
      data: {
        status: "ok",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
