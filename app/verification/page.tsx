import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Suspense } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const metadata: Metadata = { title: "Verification log" };

// The hand-verification log (PLAN §18), rendered from verification/LOG.md.
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
  return (
    <div className="space-y-4 text-sm leading-relaxed [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:hidden [&_h2]:pt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_table]:w-full [&_td]:border-t [&_td]:p-2 [&_td]:align-top [&_th]:p-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{ table: (p) => <div className="overflow-x-auto rounded-lg border"><table {...p} /></div> }}
      >
        {text}
      </Markdown>
    </div>
  );
}
