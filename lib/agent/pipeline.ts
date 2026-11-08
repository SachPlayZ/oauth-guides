import { eq } from "drizzle-orm";
import { getToolkit, hasComposioKey, type ToolkitDetail } from "../composio";
import { db } from "../db";
import { jobEvents, jobs } from "../dbschema";
import { saveGuide } from "../guides";
import { emptyUsage, MODELS, type Usage } from "../llm";
import { runProbes } from "../probes";
import { computeGuide } from "../rubric";
import { Guide, type JobEvent } from "../schema";
import { COMPOSIO_CUSTOM_AUTH_DOC, composioClaims, findingClaims, probeClaims, unanswered } from "./claims";
import { GATE_QUESTIONS, QUESTIONS, research } from "./research";
import type { ResolvedProduct } from "./resolve";
import { synthesize } from "./synthesize";
import { verifyClaims } from "./verify";

// Stages 1–7 for one resolved product (PLAN §9). generateGuide is pure apart from network calls;
// runJob wraps it with job rows, events and persistence.

export type Emit = (type: JobEvent["type"], payload: Record<string, unknown>) => void | Promise<void>;
const DEADLINE_MS = 240_000;

export async function generateGuide(product: ResolvedProduct, opts: { emit?: Emit; usage?: Usage; runId?: string } = {}): Promise<Guide> {
  const t0 = Date.now();
  const emit: Emit = async (type, payload) => opts.emit?.(type, payload);
  const usage = opts.usage ?? emptyUsage();

  // 1–3: probes, Composio lookup and research in parallel.
  await emit("stage_started", { stage: "research" });
  const pages = [product.devPortalUrl, ...product.docsCandidates.slice(0, 2)].filter((u): u is string => !!u);
  const [res, probes, toolkit] = await Promise.all([
    research({ product, deadline: t0 + DEADLINE_MS - 90_000, usage, emit: (e) => emit(e.type, e.payload as Record<string, unknown>) }),
    product.domain ? runProbes(product.domain, pages).catch(() => []) : Promise.resolve([]),
    product.toolkitSlug && hasComposioKey() ? getToolkit(product.toolkitSlug).catch(() => null) : Promise.resolve(null as ToolkitDetail | null),
  ]);
  for (const p of probes) if (p.kind === "reachability" || p.found) await emit("probe", { url: p.url, kind: p.kind });
  await emit("stage_done", { stage: "research", findings: res.findings.length, searches: res.searches, pages: res.urlsRead });

  // 4: quote check (inside findingClaims). 6: verify, before synthesis so it sees final labels.
  await emit("stage_started", { stage: "verify" });
  const quoted = findingClaims(res);
  const unmatched = quoted.filter((c) => c.sources[0]?.quoteMatched === false).length;
  const { claims: verified, conflicts } = await verifyClaims(quoted, usage);
  const claims = [...probeClaims(probes), ...(toolkit ? composioClaims(toolkit) : []), ...verified];
  await emit("stage_done", { stage: "verify", claims: claims.length, quoteUnmatched: unmatched, conflicts: conflicts.length });

  // 5: synthesize.
  await emit("stage_started", { stage: "synthesize" });
  const composio: Guide["composio"] = toolkit
    ? {
        toolkitSlug: toolkit.slug,
        managedAuthAvailable: toolkit.managedAuthAvailable,
        authSchemes: toolkit.authSchemes,
        callbackUrl: "Shown in the Composio dashboard when you create the auth config",
        authGuideUrl: toolkit.authGuideUrl ?? COMPOSIO_CUSTOM_AUTH_DOC,
        claimIds: ["k1", "k2"],
      }
    : null;
  const notFound = res.findings.filter((f) => f.answer === "not_found" && f.gateKey).map((f) => `${f.gateKey}: ${f.finding}`);
  const draft = await synthesize({ product, claims, notFound, composio, usage });
  for (const id of conflicts) draft.gotchas.push({ text: "Sources disagree on this point; check the cited pages.", severity: "warn", claimIds: [id] });
  if (res.unansweredGates.length) draft.unknowns.push(`Research didn't reach: ${res.unansweredGates.map((k) => GATE_QUESTIONS[k]).join(" ")}`);

  // 7: validate, then compute levels, effort and confidence in code.
  const guide = computeGuide(
    Guide.parse({
      ...draft,
      meta: {
        generatedAt: new Date().toISOString(),
        origin: "live",
        reviewStatus: "unreviewed",
        model: MODELS.synth()[0],
        ...(opts.runId ? { runId: opts.runId } : {}),
        durationSec: Math.round((Date.now() - t0) / 1000),
        costUsd: 0,
        unansweredQuestions: unanswered(res.findings, Object.keys(QUESTIONS)),
      },
    }),
  );
  await emit("stage_done", { stage: "synthesize", level: guide.verdict.computed?.level, confidence: guide.verdict.computed?.confidence, llmCalls: usage.calls });
  return guide;
}

export async function createJob(query: string, slug: string | null) {
  const [job] = await db.insert(jobs).values({ query, slug, status: "queued" }).returning({ id: jobs.id });
  return job.id;
}

/** Run the pipeline for a job, writing events as it goes. Never throws: errors become an event. */
export async function runJob(jobId: string, product: ResolvedProduct): Promise<void> {
  const t0 = Date.now();
  const emit: Emit = async (type, payload) => {
    await db.insert(jobEvents).values({ jobId, type, payload });
  };
  await db.update(jobs).set({ status: "running", startedAt: new Date(), slug: product.slug }).where(eq(jobs.id, jobId));
  try {
    const guide = await generateGuide(product, { emit, runId: jobId });
    const version = await saveGuide(guide, product);
    await emit("guide_ready", { slug: guide.slug, version });
    await db.update(jobs).set({ status: "done", finishedAt: new Date(), durationSec: Math.round((Date.now() - t0) / 1000), costUsd: "0" }).where(eq(jobs.id, jobId));
  } catch (e) {
    const message = (e as Error).message;
    await Promise.resolve(emit("error", { message: `Generation failed: ${message.slice(0, 300)}` })).catch(() => {});
    await db.update(jobs).set({ status: "error", finishedAt: new Date(), error: message.slice(0, 1000) }).where(eq(jobs.id, jobId));
  }
}
