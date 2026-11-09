import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./dbschema";

const globalForDb = globalThis as unknown as { pool?: Pool };

// Pooled Neon URL (PgBouncer). Reuse one pool across hot reloads in dev; on Vercel Fluid,
// attachDatabasePool closes idle clients before a function instance is suspended.
const pool = globalForDb.pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;
attachDatabasePool(pool);

export const db = drizzle(pool, { schema });
