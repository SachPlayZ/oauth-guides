import { z } from "zod";
import { generateJson, MODELS, type Usage } from "../llm";
import type { Claim } from "../schema";

// Stage 6: does each Claim's quote support its text? Runs before synthesis, so the synth model
// sees each Claim's final Evidence label. ~10 Claims per call, batches in parallel.

const VERIFY_SYSTEM = `For each claim, does its quote support it? Be strict about numbers, durations, and "required" vs "optional".
- supported: the quote says this.
- partial: the quote says part of it, or something weaker.
- unsupported: the quote doesn't say this.
- conflicting: the quote, or another claim in the list, contradicts it.
Give a one-sentence note for anything not supported.`;

const Out = z.object({
  results: z.array(z.object({ id: z.string(), status: z.enum(["supported", "partial", "unsupported", "conflicting"]), note: z.string().optional() })),
});

export async function verifyClaims(claims: Claim[], usage?: Usage): Promise<{ claims: Claim[]; conflicts: string[] }> {
  const toCheck = claims.filter((c) => c.verifier.status === "not_checked");
  const batches: Claim[][] = [];
  for (let i = 0; i < toCheck.length; i += 10) batches.push(toCheck.slice(i, i + 10));
  const verdicts = new Map<string, z.infer<typeof Out>["results"][number]>();
  await Promise.all(
    batches.map(async (batch) => {
      const prompt = batch.map((c) => `${c.id}: ${c.text}\n  quote: "${c.sources[0]?.quote ?? ""}"`).join("\n");
      try {
        const out = await generateJson({ models: MODELS.verify(), system: VERIFY_SYSTEM, prompt, schema: Out, maxTokens: 1_200, usage });
        for (const r of out.results) verdicts.set(r.id, r);
      } catch {
        // Leave the batch not_checked; confidence drops on its own.
      }
    }),
  );
  const conflicts: string[] = [];
  const out = claims.map((c) => {
    const v = verdicts.get(c.id);
    if (!v) return c;
    if (v.status === "conflicting") conflicts.push(c.id);
    const note = [c.verifier.note, v.note].filter(Boolean).join("; ") || undefined;
    return {
      ...c,
      evidence: v.status === "unsupported" ? ("unverified" as const) : c.evidence,
      verifier: { status: v.status, ...(note ? { note } : {}) },
    };
  });
  return { claims: out, conflicts };
}
