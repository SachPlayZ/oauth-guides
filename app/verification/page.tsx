import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Verification log" };

// The hand-verification log (PLAN §18), shown as written. Filled in during M5.
export default function VerificationPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Verification log</h1>
      <p className="max-w-2xl text-muted-foreground">
        How we checked agent-generated claims against sources and hands-on attempts, what was wrong, and what we changed.
      </p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Log />
      </Suspense>
    </div>
  );
}

async function Log() {
  const text = await readFile(join(process.cwd(), "verification", "LOG.md"), "utf8").catch(() => null);
  if (!text) return <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">The verification log hasn&apos;t been written yet.</p>;
  return <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border bg-muted/20 p-4 font-mono text-sm leading-relaxed">{text}</pre>;
}
