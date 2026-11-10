"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ResolvedProduct } from "@/lib/agent/resolve";
import { cn } from "@/lib/utils";

type Ev = { id: number; ts: string; type: string; payload: Record<string, unknown> };
type Phase =
  | { kind: "idle" }
  | { kind: "resolving" }
  | { kind: "candidates"; candidates: ResolvedProduct[] }
  | { kind: "existing"; slug: string; product: ResolvedProduct }
  | { kind: "running"; jobId: string; product: ResolvedProduct }
  | { kind: "error"; message: string };

const STAGES = ["Resolve", "Probe", "Research", "Check quotes", "Verify", "Write", "Score"] as const;

/** Which stages are done, from the event stream. */
function stagesDone(events: Ev[], resolved: boolean): number {
  let n = resolved ? 1 : 0;
  for (const e of events) {
    const stage = e.payload.stage;
    if (e.type === "probe" || e.type === "search") n = Math.max(n, 1);
    if (e.type === "stage_done" && stage === "research") n = Math.max(n, 3);
    if (e.type === "stage_done" && stage === "verify") n = Math.max(n, 5);
    if (e.type === "stage_done" && stage === "synthesize") n = Math.max(n, 7);
  }
  return n;
}

function describe(e: Ev): string {
  const p = e.payload;
  switch (e.type) {
    case "search": return `Searched “${p.query}” (${p.results} results)`;
    case "fetch": return `Read ${(p.urls as string[]).length} pages${(p.failed as string[]).length ? `, ${(p.failed as string[]).length} failed` : ""}`;
    case "probe": return `Probed ${p.url}`;
    case "finding": return `${p.questionId}${p.gateKey ? ` · ${String(p.gateKey).replaceAll("_", " ")} = ${p.answer}` : ""}: ${p.finding}`;
    case "stage_started": return `Started ${p.stage}`;
    case "stage_done":
      if (p.stage === "research") return `Research done: ${p.findings} findings from ${p.searches} searches and ${p.pages} pages`;
      if (p.stage === "verify") return `Checked ${p.claims} claims: ${p.quoteUnmatched} quotes not found on the page, ${p.conflicts} conflicts`;
      return `Guide written (${p.llmCalls} model calls)`;
    case "warning": return `⚠ ${p.message}`;
    case "error": return `✕ ${p.message}`;
    case "guide_ready": return "Guide ready";
    default: return e.type;
  }
}

export function GenerateRun() {
  const router = useRouter();
  const q = useSearchParams().get("q") ?? "";
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [events, setEvents] = useState<Ev[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const started = useRef(false);

  const start = useCallback(
    async (opts: { product?: ResolvedProduct; regenerate?: boolean } = {}) => {
      if (!q.trim()) return;
      setPhase({ kind: "resolving" });
      setEvents([]);
      setStartedAt(Date.now());
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q, ...opts }),
      });
      const data = await res.json().catch(() => ({ error: "Something went wrong. Try again." }));
      if (data.error) setPhase({ kind: "error", message: data.error });
      else if (data.candidates) setPhase({ kind: "candidates", candidates: data.candidates });
      else if (data.existingSlug) setPhase({ kind: "existing", slug: data.existingSlug, product: data.product });
      else setPhase({ kind: "running", jobId: data.jobId, product: data.product });
    },
    [q],
  );

  // Poll the job every second.
  const jobId = phase.kind === "running" ? phase.jobId : null;
  useEffect(() => {
    if (!jobId) return;
    let after = 0;
    let stop = false;
    const tick = async () => {
      const res = await fetch(`/api/jobs/${jobId}?after=${after}`).then((r) => r.json()).catch(() => null);
      if (stop || !res) return;
      if (res.events?.length) {
        after = res.events[res.events.length - 1].id;
        setEvents((prev) => [...prev, ...res.events]);
      }
      if (res.status === "done" && res.slug) return router.push(`/guides/${res.slug}`);
      if (res.status === "error") return setPhase({ kind: "error", message: res.error ?? "Generation failed." });
      setTimeout(tick, 1000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [jobId, router]);

  useEffect(() => {
    if (phase.kind !== "running" && phase.kind !== "resolving") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase.kind]);

  // Start as soon as the page opens.
  useEffect(() => {
    if (!started.current && q) {
      started.current = true;
      start();
    }
  }, [q, start]);

  if (!q) return <p>Type an app name in the <Link href="/" className="underline">directory</Link> search.</p>;

  const done = stagesDone(events, phase.kind === "running");
  const pages = events.filter((e) => e.type === "fetch").reduce((n, e) => n + (e.payload.urls as string[]).length, 0);
  const elapsed = startedAt ? Math.round((now - startedAt) / 1000) : 0;
  const productName = phase.kind === "running" || phase.kind === "existing" ? phase.product.productName : q;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Generating a guide</p>
        <h1 className="text-2xl font-semibold tracking-tight">{productName}</h1>
      </div>

      {phase.kind === "error" && (
        <div className="space-y-3">
          <p className="text-sm text-red-600">{phase.message}</p>
          <button onClick={() => start()} className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Try again</button>
        </div>
      )}

      {phase.kind === "resolving" && <p className="text-sm text-muted-foreground">Identifying the app… {elapsed}s</p>}

      {phase.kind === "candidates" && (
        <div className="space-y-3">
          <p className="text-sm">“{q}” could mean several apps. Which one?</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {phase.candidates.map((c) => (
              <li key={c.slug}>
                <button onClick={() => start({ product: c })} className="w-full rounded-lg border p-3 text-left hover:bg-muted/50">
                  <span className="font-medium">{c.productName}</span>
                  {c.domain && <span className="ml-2 text-sm text-muted-foreground">{c.domain}</span>}
                  {c.note && <span className="mt-1 block text-sm text-muted-foreground">{c.note}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {phase.kind === "existing" && (
        <div className="space-y-3 rounded-lg border p-4">
          <p>A guide for {phase.product.productName} was made in the last 30 days.</p>
          <div className="flex gap-2">
            <Link href={`/guides/${phase.slug}`} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Open the guide</Link>
            <button onClick={() => start({ product: phase.product, regenerate: true })} className="rounded-lg border px-4 py-2 text-sm">Regenerate</button>
          </div>
        </div>
      )}

      {phase.kind === "running" && (
        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          <ol className="space-y-2 text-sm">
            {STAGES.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span className={cn("flex size-5 items-center justify-center rounded-full border text-xs", i < done ? "border-emerald-600 bg-emerald-600 text-white" : i === done ? "animate-pulse border-foreground" : "text-muted-foreground")}>
                  {i < done ? "✓" : i + 1}
                </span>
                <span className={cn(i > done && "text-muted-foreground")}>{s}</span>
              </li>
            ))}
            <li className="pt-2 text-muted-foreground">{elapsed}s · {pages} pages read</li>
          </ol>
          <ul className="max-h-[60vh] space-y-1 overflow-y-auto rounded-lg border bg-muted/20 p-3 font-mono text-xs" aria-live="polite">
            {events.length === 0 && <li className="text-muted-foreground">Waiting for the first results…</li>}
            {events.map((e) => (
              <li key={e.id} className={cn(e.type === "error" && "text-red-600", e.type === "warning" && "text-amber-700", e.type === "finding" && "text-muted-foreground")}>
                {describe(e)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
