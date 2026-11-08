// Manual check for Stage 3: pnpm tsx scripts/try-research.ts "<query>"
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { resolve } = await import("../lib/agent/resolve");
  const { research } = await import("../lib/agent/research");
  const { emptyUsage } = await import("../lib/llm");
  const query = process.argv.slice(2).join(" ");
  const r = await resolve(query);
  if (r.kind !== "resolved") return console.log(JSON.stringify(r, null, 2));
  const t0 = Date.now();
  const s = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`.padStart(4);
  const usage = emptyUsage();
  const out = await research({
    product: r.product,
    deadline: t0 + 150_000,
    usage,
    emit: (e) => {
      const p = e.payload as Record<string, unknown>;
      if (e.type === "finding") console.log(s(), "finding", p.questionId, p.gateKey ?? "", p.answer ?? "", "|", String(p.finding).slice(0, 90), "|", p.url);
      else console.log(s(), e.type, JSON.stringify(p).slice(0, 160));
    },
  });
  console.log(`\n${s()} done: ${out.findings.length} findings (${out.findings.filter((f) => f.quote).length} quoted); ${out.searches} searches; ${out.urlsRead} pages; unanswered gates: ${out.unansweredGates.join(", ") || "none"}`);
  console.log(`LLM: ${usage.calls} calls, ${usage.inputTokens} in / ${usage.outputTokens} out tokens`);
}
main().catch((e) => { console.error(e); process.exit(1); });
