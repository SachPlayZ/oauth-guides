// Seed the directory: top 100 OAuth Toolkits by usage → data/library.json + products table.
// pnpm tsx scripts/seed-library.ts  (falls back to the committed data/library.json if Composio is unreachable)
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync, writeFileSync } from "node:fs";

type LibraryItem = { slug: string; name: string; appUrl: string | null; logo: string | null; managedAuth: boolean; rank: number };
const FILE = "data/library.json";

async function main() {
  const { listToolkitsByUsage, isOAuthScheme } = await import("../lib/composio");
  const { db } = await import("../lib/db");
  const { products } = await import("../lib/dbschema");
  const { registrableDomain } = await import("../lib/agent/resolve");

  let items: LibraryItem[];
  try {
    const all = await listToolkitsByUsage(100);
    items = all
      .filter((t) => t.authSchemes.some(isOAuthScheme))
      .slice(0, 100)
      .map((t, i) => ({ slug: t.slug, name: t.name, appUrl: t.appUrl, logo: t.logo, managedAuth: t.managedAuthAvailable, rank: i + 1 }));
    writeFileSync(FILE, `${JSON.stringify(items, null, 2)}\n`);
    console.log(`Wrote ${items.length} Toolkits to ${FILE}`);
  } catch (e) {
    console.warn(`Composio unreachable (${(e as Error).message}); using ${FILE}`);
    items = JSON.parse(readFileSync(FILE, "utf8"));
  }

  for (const t of items) {
    const providerName = t.appUrl ? (registrableDomain(t.appUrl) ?? t.name) : t.name;
    await db
      .insert(products)
      .values({ slug: t.slug, productName: t.name, providerName, productUrl: t.appUrl, logo: t.logo, toolkitSlug: t.slug, composioManaged: t.managedAuth, inLibrary: true, popularity: t.rank })
      .onConflictDoUpdate({ target: products.slug, set: { logo: t.logo, toolkitSlug: t.slug, composioManaged: t.managedAuth, inLibrary: true, popularity: t.rank } });
  }
  console.log(`Upserted ${items.length} products`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
