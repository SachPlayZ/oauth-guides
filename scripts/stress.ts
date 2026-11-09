// Stress tests (PLAN §20): pnpm tsx scripts/stress.ts [--save] "<query>" ... → timing, level and errors per query.
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { resolve } = await import("../lib/agent/resolve");
  const { generateGuide } = await import("../lib/agent/pipeline");
  const { emptyUsage } = await import("../lib/llm");
  const { formatLevel } = await import("../lib/rubric");
  const save = process.argv.includes("--save");
  const queries = process.argv.slice(2).filter((a) => a !== "--save");
  const rows: string[] = [];
  for (const q of queries) {
    const t0 = Date.now();
    const sec = () => ((Date.now() - t0) / 1000).toFixed(0);
    try {
      const r = await resolve(q);
      if (r.kind !== "resolved") {
        const what = r.kind === "candidates" ? `candidates: ${r.candidates.map((c) => c.productName).join(", ")}` : JSON.stringify(r).slice(0, 120);
        rows.push(`| ${q} | ${r.kind} | ${what} | ${sec()}s |`);
        console.log(rows.at(-1));
        continue;
      }
      const usage = emptyUsage();
      let research = "";
      const guide = await generateGuide(r.product, {
        usage,
        emit: (type, p) => {
          if (type === "stage_done" && p.stage === "research") research = `${p.searches} searches, ${p.pages} pages`;
        },
      });
      const c = guide.verdict.computed!;
      const toolkit = guide.composio ? `toolkit ${guide.composio.toolkitSlug}` : "no toolkit";
      rows.push(`| ${q} | ${guide.productName} (${toolkit}) | ${formatLevel(c.level, c.levelCeiling)} · ${c.confidence} · ${guide.claims.length} claims · ${research} · ${usage.calls} LLM calls | ${guide.meta.durationSec}s |`);
      if (save) {
        const { saveGuide } = await import("../lib/guides");
        await saveGuide(guide, r.product);
      }
    } catch (e) {
      rows.push(`| ${q} | ERROR | ${(e as Error).message.slice(0, 160)} | ${sec()}s |`);
    }
    console.log(rows.at(-1));
  }
  console.log(`\n| Query | Result | Detail | Time |\n|---|---|---|---|\n${rows.join("\n")}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
