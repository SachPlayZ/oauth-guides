import type { NextRequest } from "next/server";
import { getShownGuide } from "@/lib/guides";

// Shown Guide version as JSON, for agents.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/guides/[slug]">) {
  const { slug } = await ctx.params;
  const shown = await getShownGuide(slug);
  if (!shown) return Response.json({ error: "No guide for this app yet" }, { status: 404 });
  return Response.json({ version: shown.version, newerUnreviewed: shown.newerUnreviewed, guide: shown.guide });
}
