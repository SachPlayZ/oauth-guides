"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtRange, LevelBadge } from "@/components/level-badge";
import { checklist, guideToMarkdown } from "@/lib/markdown";
import { LEVEL_LABEL, rowLevel } from "@/lib/rubric";
import type { Claim, Guide } from "@/lib/schema";
import { useLocalStorage } from "@/lib/use-local-storage";
import { cn } from "@/lib/utils";

const OWNER = {
  setup_agent: { icon: "🤖", label: "Setup agent", cls: "bg-sky-100 text-sky-900" },
  setup_agent_drafts: { icon: "🤝", label: "Agent drafts, you confirm", cls: "bg-violet-100 text-violet-900" },
  you: { icon: "👤", label: "You", cls: "bg-stone-200 text-stone-900" },
} as const;
const EVIDENCE = {
  tested: "bg-emerald-100 text-emerald-900",
  documented: "bg-sky-100 text-sky-900",
  reported: "bg-amber-100 text-amber-900",
  unverified: "bg-stone-200 text-stone-700",
} as const;
const ANSWER = { yes: "bg-red-100 text-red-900", no: "bg-emerald-100 text-emerald-900", unknown: "bg-stone-200 text-stone-700" } as const;
const SEVERITY = { blocker: "border-red-300 bg-red-50", warn: "border-amber-300 bg-amber-50", info: "border-border bg-muted/30" } as const;
const PHASE_LABEL: Record<string, string> = { prepare: "Prepare", create: "Create", configure: "Configure", connect_composio: "Connect to Composio", test: "Test", submit: "Submit", wait: "Wait", launch: "Launch" };

export function GuideView({ guide, version, newerUnreviewed }: { guide: Guide; version: number; newerUnreviewed: boolean }) {
  const [rowId, setRowId] = useState(guide.defaultUsageId);
  const row = guide.usageRows.find((r) => r.id === rowId)!;
  const lvl = rowLevel(row);
  const c = guide.verdict.computed!;
  const claims = useMemo(() => new Map(guide.claims.map((x) => [x.id, x])), [guide.claims]);
  const startHere = guide.steps.find((s) => s.id === c.startHereStepId);

  return (
    <article className="space-y-10">
      {/* 1. Verdict */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={cn("rounded-full px-2 py-0.5", guide.meta.reviewStatus === "reviewed" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900")}>
            {guide.meta.reviewStatus === "reviewed" ? "Reviewed" : "Agent-generated, unreviewed"}
          </span>
          {guide.composio && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              Composio Toolkit · managed auth {guide.composio.managedAuthAvailable ? "available" : "not available"}
            </span>
          )}
          <span className="text-muted-foreground">v{version} · last checked {c.lastChecked.slice(0, 10)}</span>
          {newerUnreviewed && <span className="text-amber-700">A newer unreviewed run exists</span>}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{guide.productName}: your own OAuth app</h1>

        <div className="grid gap-4 rounded-xl border p-5 md:grid-cols-[auto_1fr]">
          <div className="flex flex-col gap-1">
            <LevelBadge level={lvl.level} ceiling={lvl.levelCeiling} size="lg" />
            <span className="text-sm font-medium">{LEVEL_LABEL[lvl.level]}{lvl.levelCeiling !== lvl.level ? ` to ${LEVEL_LABEL[lvl.levelCeiling]}?` : ""}</span>
          </div>
          <div className="space-y-3">
            <p className="text-lg leading-snug">{guide.verdict.oneLiner}</p>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Hands-on effort" value={`~${fmtRange(c.handsOnEffort)}`} />
              <Stat label="Approval wait" value={guide.verdict.approvalWait ? `~${fmtRange(guide.verdict.approvalWait.range)}` : "Unknown"} />
              <Stat label="Confidence" value={c.confidence} hint={c.confidence === "low" ? "Some gates are unknown or claims unverified" : undefined} />
              <Stat label="Cost" value={guide.verdict.costs.length ? guide.verdict.costs.map((x) => x.text).join("; ") : "None found"} />
            </dl>
            {startHere && (
              <a href={`#${startHere.id}`} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
                Start here: {startHere.title} →
              </a>
            )}
          </div>
        </div>
      </section>

      {/* 2. Usage toggle */}
      {guide.usageRows.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">What will your agent do? The level depends on it.</h2>
          <div role="radiogroup" className="flex flex-wrap gap-2">
            {guide.usageRows.map((r) => {
              const l = rowLevel(r);
              return (
                <button
                  key={r.id}
                  role="radio"
                  aria-checked={r.id === rowId}
                  onClick={() => setRowId(r.id)}
                  className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", r.id === rowId ? "border-foreground bg-muted" : "hover:bg-muted/50")}
                >
                  <LevelBadge level={l.level} ceiling={l.levelCeiling} size="sm" />
                  {r.usage}
                  {r.id === guide.defaultUsageId && <span className="text-xs text-muted-foreground">(typical)</span>}
                </button>
              );
            })}
          </div>
          {row.exampleScopes.length > 0 && <p className="text-xs text-muted-foreground">Scopes: <code>{row.exampleScopes.join(", ")}</code></p>}
        </section>
      )}

      {/* 3. Why this level */}
      <Section title="Why this level" sub="Each gate a provider can put between you and Production. Unknown gates widen the level into a range.">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <tbody>
              {row.gates.map((g) => (
                <tr key={g.key} className="border-b last:border-0">
                  <td className="px-3 py-2">{g.key.replaceAll("_", " ")}</td>
                  <td className="px-3 py-2"><span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", ANSWER[g.answer])}>{g.answer}</span></td>
                  <td className="px-3 py-2"><Cites ids={g.claimIds} claims={claims} /></td>
                </tr>
              ))}
              {row.blockingLimits.map((b, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-3 py-2">Blocking limit: {b.text}</td>
                  <td className="px-3 py-2"><span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", ANSWER.yes)}>yes</span></td>
                  <td className="px-3 py-2"><Cites ids={b.claimIds} claims={claims} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {row.notes && <p className="text-sm text-muted-foreground">{row.notes}</p>}
      </Section>

      {/* 4. Before you start */}
      {(row.requirements.length > 0 || row.artifacts.length > 0) && (
        <Section title="Before you start">
          <ul className="space-y-1 text-sm">
            {row.requirements.map((r, i) => <li key={i}>• {r.label} <Cites ids={r.claimIds} claims={claims} /></li>)}
            {row.artifacts.map((a, i) => <li key={`a${i}`}>• Prepare {a.label} (~{a.estMinutes} min) <Cites ids={a.claimIds} claims={claims} /></li>)}
          </ul>
        </Section>
      )}

      {/* 5. Steps */}
      <Section title="Steps" sub="Who does what: a browser Setup agent can do 🤖 steps, drafts 🤝 for you to confirm, and hands back at ✋ takeover points.">
        <Steps guide={guide} claims={claims} />
      </Section>

      {guide.whileYouWait.length > 0 && (
        <Section title="While you wait">
          <ul className="space-y-1 text-sm">{guide.whileYouWait.map((w, i) => <li key={i}>• {w.text} <Cites ids={w.claimIds} claims={claims} /></li>)}</ul>
        </Section>
      )}

      {guide.gotchas.length > 0 && (
        <Section title="Gotchas">
          <ul className="space-y-2">
            {[...guide.gotchas].sort((a, b) => order(a.severity) - order(b.severity)).map((g, i) => (
              <li key={i} className={cn("rounded-lg border p-3 text-sm", SEVERITY[g.severity])}>
                <span className="mr-2 text-xs font-semibold uppercase">{g.severity}</span>{g.text} <Cites ids={g.claimIds} claims={claims} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {guide.unknowns.length > 0 && (
        <Section title="What we couldn't verify">
          <ul className="space-y-1 text-sm text-muted-foreground">{guide.unknowns.map((u, i) => <li key={i}>• {u}</li>)}</ul>
        </Section>
      )}

      <Section title="Evidence" sub="Tested: we did it. Documented: official docs. Reported: community sources. Unverified: inference or a quote we couldn't match.">
        <ul className="space-y-2">
          {guide.claims.map((x) => <ClaimRow key={x.id} claim={x} />)}
        </ul>
      </Section>

      <Actions guide={guide} />
    </article>
  );
}

const order = (s: string) => (s === "blocker" ? 0 : s === "warn" ? 1 : 2);

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium first-letter:uppercase">{value}</dd>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Cites({ ids, claims }: { ids: string[]; claims: Map<string, Claim> }) {
  if (!ids.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {ids.map((id) => {
        const c = claims.get(id);
        return (
          <a key={id} href={`#claim-${id}`} title={c?.text} className={cn("rounded px-1 font-mono text-[11px] hover:underline", c ? EVIDENCE[c.evidence] : "bg-muted")}>
            {id}
          </a>
        );
      })}
    </span>
  );
}

function Steps({ guide, claims }: { guide: Guide; claims: Map<string, Claim> }) {
  const key = `runway:ticks:${guide.slug}:${guide.meta.generatedAt}`;
  const [raw, setRaw] = useLocalStorage(key);
  const ticks = useMemo<Record<string, boolean>>(() => {
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return {};
    }
  }, [raw]);
  const toggle = (id: string) => setRaw(JSON.stringify({ ...ticks, [id]: !ticks[id] }));

  return (
    <ol className="relative space-y-4 border-l pl-6">
      {guide.steps.map((s) => {
        const o = OWNER[s.owner];
        return (
          <li key={s.id} id={s.id} className="scroll-mt-20">
            <span className={cn("absolute -left-[7px] mt-1.5 size-3 rounded-full border-2 bg-background", ticks[s.id] && "border-emerald-600 bg-emerald-600")} />
            <div className="flex flex-wrap items-center gap-2">
              <input type="checkbox" checked={!!ticks[s.id]} onChange={() => toggle(s.id)} aria-label={`Done: ${s.title}`} className="print:hidden" />
              <h3 className={cn("font-medium", ticks[s.id] && "text-muted-foreground line-through")}>{s.title}</h3>
              <span className={cn("rounded-full px-2 py-0.5 text-xs", o.cls)}>{o.icon} {o.label}</span>
              <span className="text-xs text-muted-foreground">{PHASE_LABEL[s.phase]}{s.estMinutes ? ` · ~${s.estMinutes} min` : ""}</span>
            </div>
            <p className="mt-1 text-sm">{s.detail} <Cites ids={s.claimIds} claims={claims} /></p>
            {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-sm text-sky-700 underline underline-offset-2">{s.url}</a>}
            {s.takeoverPoints.map((t, i) => <p key={i} className="mt-1 text-sm">✋ <span className="font-medium">Takeover:</span> {t}</p>)}
            {s.blockers.map((b, i) => (
              <p key={`b${i}`} className="mt-1 rounded-md bg-amber-50 p-2 text-sm">⚠ {b.text} <span className="text-muted-foreground">→ {b.workaround}</span></p>
            ))}
          </li>
        );
      })}
    </ol>
  );
}

function ClaimRow({ claim }: { claim: Claim }) {
  const s = claim.sources[0];
  return (
    <li id={`claim-${claim.id}`} className="scroll-mt-20 rounded-lg border p-3 text-sm target:ring-2 target:ring-ring">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs">{claim.id}</span>
        <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium capitalize", EVIDENCE[claim.evidence])}>{claim.evidence}</span>
        {claim.verifier.status !== "not_checked" && <span className="text-xs text-muted-foreground">verifier: {claim.verifier.status}</span>}
        <span className="text-xs text-muted-foreground">checked {claim.checkedAt.slice(0, 10)}</span>
      </div>
      <p className="mt-1">{claim.text}</p>
      {s && (
        <details className="mt-1 text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            <a href={s.url} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">{s.url}</a>
            {s.quoteMatched === false && " · quote not found on page"}
          </summary>
          {s.quote && <blockquote className="mt-1 border-l-2 pl-2 italic">“{s.quote}”</blockquote>}
          {claim.verifier.note && <p className="mt-1">{claim.verifier.note}</p>}
        </details>
      )}
    </li>
  );
}

function Actions({ guide }: { guide: Guide }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied("Copy failed");
    }
  };
  const url = typeof window === "undefined" ? "" : window.location.href.split("#")[0];
  const btn = "rounded-lg border px-3 py-1.5 text-sm hover:bg-muted";
  return (
    <section className="flex flex-wrap items-center gap-2 border-t pt-6 print:hidden">
      <button className={btn} onClick={() => copy("Link", url)}>Copy link</button>
      <button className={btn} onClick={() => copy("Markdown", guideToMarkdown(guide, url))}>Copy as Markdown</button>
      <button className={btn} onClick={() => copy("Checklist", checklist(guide))}>Copy checklist</button>
      <button className={btn} onClick={() => window.print()}>Print</button>
      <Link className={btn} href={`/api/guides/${guide.slug}/markdown`} target="_blank">Raw Markdown</Link>
      <Link className={btn} href={`/generate?q=${encodeURIComponent(guide.productName)}`}>Regenerate</Link>
      {copied && <span className="text-sm text-muted-foreground">{copied === "Copy failed" ? copied : `${copied} copied`}</span>}
    </section>
  );
}
