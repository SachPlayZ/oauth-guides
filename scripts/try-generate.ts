// End-to-end check for Stages 0–7: pnpm tsx scripts/try-generate.ts "<query>" [--save] [--out file.json]
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { resolve } = await import("../lib/agent/resolve");
  const { generateGuide } = await import("../lib/agent/pipeline");
  const { emptyUsage } = await import("../lib/llm");
  const { formatLevel } = await import("../lib/rubric");
  const args = process.argv.slice(2);
  const save = args.includes("--save");
  const outAt = args.indexOf("--out");
  const outFile = outAt >= 0 ? args[outAt + 1] : null;
  const r = await resolve(args.filter((a, i) => a !== "--save" && i !== outAt && i !== outAt + 1).join(" "));
  if (r.kind !== "resolved") return console.log(JSON.stringify(r, null, 2));
  const t0 = Date.now();
  const usage = emptyUsage();
  const guide = await generateGuide(r.product, {
    usage,
    emit: (type, p) => {
      if (type !== "finding") console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s`.padStart(4), type, JSON.stringify(p).slice(0, 140));
    },
  });
  const c = guide.verdict.computed!;
  console.log(`\n${guide.productName}: ${formatLevel(c.level, c.levelCeiling)}, confidence ${c.confidence}, effort ${c.handsOnEffort.min}-${c.handsOnEffort.max} ${c.handsOnEffort.unit}`);
  console.log(`One-liner: ${guide.verdict.oneLiner}`);
  for (const row of guide.usageRows) console.log(`  row ${row.id}${row.id === guide.defaultUsageId ? "*" : ""}: ${formatLevel(row.level!, row.levelCeiling!)} ${row.usage} | ${row.gates.filter((g) => g.answer !== "unknown").map((g) => `${g.key}=${g.answer}`).join(", ")}`);
  console.log(`Claims ${guide.claims.length} (${["tested", "documented", "reported", "unverified"].map((e) => `${e} ${guide.claims.filter((x) => x.evidence === e).length}`).join(", ")}); steps ${guide.steps.length}; unknowns ${guide.unknowns.length}`);
  guide.unknowns.slice(0, 5).forEach((u) => console.log(`  ? ${u}`));
  console.log(`LLM: ${usage.calls} calls, ${usage.inputTokens} in / ${usage.outputTokens} out; ${guide.meta.durationSec}s`);
  if (outFile) {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, `${JSON.stringify(guide, null, 2)}\n`);
    console.log(`Wrote ${outFile}`);
  }
  if (save) {
    const { saveGuide } = await import("../lib/guides");
    console.log(`Saved version ${await saveGuide(guide, r.product)}`);
    process.exit(0);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
