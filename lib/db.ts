import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./dbschema";

const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

// Reuse one pool across hot reloads in dev.
const sql = globalForDb.sql ?? postgres(process.env.DATABASE_URL!, { max: 5, prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export const db = drizzle(sql, { schema });
