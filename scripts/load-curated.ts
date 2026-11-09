// Load data/curated/*.json as Guide versions (validated, levels computed).
// pnpm tsx scripts/load-curated.ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { readdirSync, readFileSync } from "node:fs";

async function main() {
  const { Guide } = await import("../lib/schema");
  const { computeGuide } = await import("../lib/rubric");
  const { saveGuide } = await import("../lib/guides");
  const dir = "data/curated";
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const guide = computeGuide(Guide.parse(JSON.parse(readFileSync(`${dir}/${f}`, "utf8"))));
    console.log(`${guide.slug}: version ${await saveGuide(guide)} (${guide.meta.reviewStatus})`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
