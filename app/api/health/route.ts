import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "connected" });
  } catch (e) {
    return Response.json({ ok: false, db: (e as Error).message }, { status: 500 });
  }
}
