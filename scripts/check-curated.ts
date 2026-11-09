// Validate data/curated/*.json and print computed verdicts: pnpm tsx scripts/check-curated.ts
import { readdirSync, readFileSync } from "node:fs";
import { formatLevel } from "../lib/rubric";
import { computeGuide } from "../lib/rubric";
import { Guide } from "../lib/schema";

for (const f of readdirSync("data/curated").filter((f) => f.endsWith(".json"))) {
  const g = computeGuide(Guide.parse(JSON.parse(readFileSync(`data/curated/${f}`, "utf8"))));
  const c = g.verdict.computed!;
  console.log(`${g.slug}: ${formatLevel(c.level, c.levelCeiling)} ${c.confidence} effort ${c.handsOnEffort.min}-${c.handsOnEffort.max} ${c.handsOnEffort.unit} · ${g.claims.length} claims · ${g.meta.reviewStatus}`);
}
