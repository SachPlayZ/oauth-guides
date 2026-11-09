import { and, asc, eq, gt } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jobEvents, jobs } from "@/lib/dbschema";

// GET ?after=N → {status, slug, error, events[]} with events whose id > N
export async function GET(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Unknown job" }, { status: 404 });
  const after = Number(req.nextUrl.searchParams.get("after") ?? 0) || 0;
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) return Response.json({ error: "Unknown job" }, { status: 404 });
  const events = await db
    .select()
    .from(jobEvents)
    .where(and(eq(jobEvents.jobId, id), gt(jobEvents.id, after)))
    .orderBy(asc(jobEvents.id));
  return Response.json({
    status: job.status,
    slug: job.slug,
    error: job.error,
    startedAt: job.startedAt,
    events: events.map((e) => ({ id: e.id, ts: e.ts, type: e.type, payload: e.payload })),
  });
}
