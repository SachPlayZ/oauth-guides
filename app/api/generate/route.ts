import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { createJob, runJob } from "@/lib/agent/pipeline";
import { resolve, type ResolvedProduct } from "@/lib/agent/resolve";
import { latestVersionAt } from "@/lib/guides";
import { checkGenerationLimit } from "@/lib/ratelimit";

export const maxDuration = 300;

const FRESH_MS = 30 * 24 * 3_600_000;
const Body = z.object({
  query: z.string().trim().min(1).max(200),
  passcode: z.string().optional(),
  product: z.custom<ResolvedProduct>((v) => !!v && typeof v === "object" && typeof (v as ResolvedProduct).slug === "string").optional(),
  regenerate: z.boolean().optional(),
});

// POST {query, passcode, product?, regenerate?} → {jobId} | {candidates} | {existingSlug} | {error}
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Type an app name or paste its website." }, { status: 400 });
  const { query, passcode, regenerate } = parsed.data;
  if (process.env.DEMO_PASSCODE && passcode !== process.env.DEMO_PASSCODE) return Response.json({ error: "Wrong passcode." }, { status: 401 });

  let product = parsed.data.product;
  if (!product) {
    const r = await resolve(query);
    if (r.kind === "not_found") return Response.json({ error: r.message }, { status: 404 });
    if (r.kind === "candidates") return Response.json({ candidates: r.candidates });
    product = r.product;
  }
  if (!regenerate) {
    const at = (await latestVersionAt(product.slug, "live")) ?? (await latestVersionAt(product.slug, "curated"));
    if (at && Date.now() - at.getTime() < FRESH_MS) return Response.json({ existingSlug: product.slug, product });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limited = await checkGenerationLimit(ip);
  if (limited) return Response.json({ error: limited }, { status: 429 });

  const jobId = await createJob(query, product.slug);
  const resolved = product;
  after(() => runJob(jobId, resolved));
  return Response.json({ jobId, product });
}
