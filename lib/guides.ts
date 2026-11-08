import { and, desc, eq, sql } from "drizzle-orm";
import type { ResolvedProduct } from "./agent/resolve";
import { db } from "./db";
import { guideVersions, products } from "./dbschema";
import type { Guide } from "./schema";

// Guide versions in Postgres (PLAN §11). Shown version: latest reviewed, else latest.

/** Upsert the product and append a Guide version. Returns the new version number. */
export async function saveGuide(guide: Guide, product?: Pick<ResolvedProduct, "logo" | "toolkitSlug" | "managedAuthAvailable">): Promise<number> {
  return db.transaction(async (tx) => {
    await tx
      .insert(products)
      .values({
        slug: guide.slug,
        productName: guide.productName,
        providerName: guide.providerName,
        productUrl: guide.productUrl ?? null,
        logo: product?.logo ?? null,
        toolkitSlug: guide.composio?.toolkitSlug ?? product?.toolkitSlug ?? null,
        composioManaged: guide.composio?.managedAuthAvailable ?? product?.managedAuthAvailable ?? null,
      })
      .onConflictDoUpdate({ target: products.slug, set: { productName: guide.productName, providerName: guide.providerName } });
    const [{ max }] = await tx
      .select({ max: sql<number | null>`max(${guideVersions.version})` })
      .from(guideVersions)
      .where(eq(guideVersions.slug, guide.slug));
    const version = (max ?? 0) + 1;
    const c = guide.verdict.computed;
    await tx.insert(guideVersions).values({
      slug: guide.slug,
      version,
      origin: guide.meta.origin,
      reviewStatus: guide.meta.reviewStatus,
      level: c?.level ?? null,
      levelCeiling: c?.levelCeiling ?? null,
      confidence: c?.confidence ?? null,
      data: guide,
    });
    return version;
  });
}

export async function getShownGuide(slug: string): Promise<{ guide: Guide; version: number; newerUnreviewed: boolean } | null> {
  const rows = await db.select().from(guideVersions).where(eq(guideVersions.slug, slug)).orderBy(desc(guideVersions.version));
  if (!rows.length) return null;
  const shown = rows.find((r) => r.reviewStatus === "reviewed") ?? rows[0];
  return { guide: shown.data as Guide, version: shown.version, newerUnreviewed: rows[0].version > shown.version };
}

export async function latestVersionAt(slug: string, origin: "curated" | "live") {
  const [row] = await db
    .select({ createdAt: guideVersions.createdAt })
    .from(guideVersions)
    .where(and(eq(guideVersions.slug, slug), eq(guideVersions.origin, origin)))
    .orderBy(desc(guideVersions.version))
    .limit(1);
  return row?.createdAt ?? null;
}
