"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { fmtRange, LevelBadge } from "@/components/level-badge";
import type { DirectoryEntry } from "@/lib/guides";
import { LEVEL_LABEL } from "@/lib/rubric";
import { cn } from "@/lib/utils";

const STATUS = { reviewed: "Reviewed", unreviewed: "Agent-generated, unreviewed", none: "Not generated yet" } as const;

export function Directory({ items }: { items: DirectoryEntry[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [managed, setManaged] = useState(false);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter(
      (e) =>
        (!s || e.productName.toLowerCase().includes(s) || e.slug.includes(s)) &&
        (!level || String(e.level) === level) &&
        (!status || e.status === status) &&
        (!managed || e.managedAuth),
    );
  }, [items, q, level, status, managed]);

  const generate = () => q.trim() && router.push(`/generate?q=${encodeURIComponent(q.trim())}`);
  const generated = items.filter((e) => e.status !== "none").length;

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (shown.length === 1 && shown[0].status !== "none") router.push(`/guides/${shown[0].slug}`);
          else generate();
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Look up an app or paste its website"
          aria-label="Look up an app or paste its website"
          className="h-11 flex-1 rounded-lg border bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <button type="submit" disabled={!q.trim()} className="h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {shown.length === 1 && shown[0].status !== "none" ? "Open guide" : "Generate guide"}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Runway level" className="h-8 rounded-md border bg-background px-2">
          <option value="">Any level</option>
          {LEVEL_LABEL.map((l, i) => (
            <option key={i} value={i}>R{i} · {l}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="h-8 rounded-md border bg-background px-2">
          <option value="">Any status</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label className="flex h-8 items-center gap-2 rounded-md border px-2">
          <input type="checkbox" checked={managed} onChange={(e) => setManaged(e.target.checked)} />
          Composio managed auth available
        </label>
        <span className="ml-auto text-muted-foreground">
          {shown.length} of {items.length} apps · {generated} with guides
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No app in the directory matches.{" "}
          {q.trim() && (
            <button onClick={generate} className="font-medium text-foreground underline underline-offset-4">
              Generate a guide for “{q.trim()}”
            </button>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((e) => (
            <li key={e.slug}>
              <ProductCard e={e} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductCard({ e }: { e: DirectoryEntry }) {
  const has = e.status !== "none";
  return (
    <Link
      href={has ? `/guides/${e.slug}` : `/generate?q=${encodeURIComponent(e.productName)}`}
      className={cn("flex h-full flex-col gap-3 rounded-lg border p-4 transition-colors hover:border-foreground/30 hover:bg-muted/40", !has && "bg-muted/20")}
    >
      <div className="flex items-center gap-3">
        {e.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.logo} alt="" className="size-8 rounded object-contain" loading="lazy" />
        ) : (
          <span className="flex size-8 items-center justify-center rounded bg-muted text-sm font-semibold">{e.productName[0]}</span>
        )}
        <span className="font-medium">{e.productName}</span>
        <span className="ml-auto">{has ? <LevelBadge level={e.level} ceiling={e.levelCeiling} size="sm" /> : null}</span>
      </div>
      {has ? (
        <p className="text-sm text-muted-foreground">
          ~{fmtRange(e.effort)} work · {e.wait ? `~${fmtRange(e.wait)} wait` : "wait unknown"}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Generate a guide →</p>
      )}
      <div className="mt-auto flex flex-wrap gap-1.5 text-xs">
        <span className={cn("rounded-full px-2 py-0.5", e.status === "reviewed" ? "bg-emerald-100 text-emerald-900" : e.status === "unreviewed" ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground")}>
          {STATUS[e.status]}
        </span>
        {e.managedAuth && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Managed auth</span>}
        {e.confidence && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{e.confidence} confidence</span>}
      </div>
    </Link>
  );
}
