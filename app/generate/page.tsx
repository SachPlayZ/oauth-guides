import type { Metadata } from "next";
import { Suspense } from "react";
import { GenerateRun } from "./run";

export const metadata: Metadata = { title: "Generate a guide" };

export default function GeneratePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <GenerateRun />
    </Suspense>
  );
}
