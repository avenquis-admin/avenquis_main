import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.NODE_ENV === "test" && process.env.TEST_DATABASE_URL ? process.env.TEST_DATABASE_URL : env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
export { pool };
