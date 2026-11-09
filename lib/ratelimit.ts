import { gte, sql } from "drizzle-orm";
import { db } from "./db";
import { jobs } from "./dbschema";

// Generation limits (PLAN §12): 5/hour per IP (in memory, per instance) and a global hourly cap (DB).

const PER_IP = 5;
const HOUR = 3_600_000;
const hits = new Map<string, number[]>();

export async function checkGenerationLimit(ip: string): Promise<string | null> {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < HOUR);
  if (recent.length >= PER_IP) return `Limit reached: ${PER_IP} generations per hour. Try again later.`;
  const max = Number(process.env.MAX_GENERATIONS_PER_HOUR ?? 30);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(jobs).where(gte(jobs.startedAt, new Date(now - HOUR)));
  if (n >= max) return "The demo's hourly generation budget is used up. Try again later.";
  hits.set(ip, [...recent, now]);
  return null;
}
