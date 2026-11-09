import type { NextRequest } from "next/server";
import { getShownGuide } from "@/lib/guides";
import { guideToMarkdown } from "@/lib/markdown";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/guides/[slug]/markdown">) {
  const { slug } = await ctx.params;
  const shown = await getShownGuide(slug);
  if (!shown) return new Response("No guide for this app yet\n", { status: 404 });
  const url = new URL(`/guides/${slug}`, req.nextUrl.origin).toString();
  return new Response(guideToMarkdown(shown.guide, url), { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
