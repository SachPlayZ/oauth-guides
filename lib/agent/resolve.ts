import { z } from "zod";
import { hasComposioKey, searchToolkits, type ToolkitSummary } from "../composio";
import { MODELS, runToolLoop, type Usage } from "../llm";
import { webSearch } from "../search";

// Stage 0: turn free text (a name or URL) into one Provider product, a short list to pick from,
// or "not found". Composio Toolkits first, then a short LLM web-search loop (ADR-0003).

export type ResolvedProduct = {
  slug: string;
  productName: string;
  providerName: string | null; // unknown for Composio matches; research fills it in
  domain: string | null;
  productUrl: string | null;
  devPortalUrl: string | null;
  docsCandidates: string[];
  toolkitSlug: string | null;
  logo: string | null;
  managedAuthAvailable: boolean | null;
  note?: string; // why this candidate, shown in the picker
};

export type Resolution =
  | { kind: "resolved"; product: ResolvedProduct; via: "composio" | "web" }
  | { kind: "candidates"; candidates: ResolvedProduct[]; via: "composio" | "web" }
  | { kind: "not_found"; message: string };

const MULTI_PART_TLDS = new Set(["co.uk", "com.au", "co.jp", "co.in", "com.br", "co.nz", "co.za"]);

/** "https://www.app.linear.app/x" → "linear.app". Null for plain names. */
export function registrableDomain(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (/\s/.test(s) || !s.includes(".")) return null;
  let host: string;
  try {
    host = new URL(s.includes("://") ? s : `https://${s}`).hostname;
  } catch {
    return null;
  }
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return null;
  const lastTwo = parts.slice(-2).join(".");
  return MULTI_PART_TLDS.has(lastTwo) && parts.length >= 3 ? parts.slice(-3).join(".") : lastTwo;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";

function fromToolkit(t: ToolkitSummary): ResolvedProduct {
  // Some Toolkits list Composio's own site as their app URL (e.g. tavily, discord); that's no product domain.
  const appUrl = t.appUrl && registrableDomain(t.appUrl) !== "composio.dev" ? t.appUrl : null;
  return {
    slug: t.slug,
    productName: t.name,
    providerName: null,
    domain: appUrl ? registrableDomain(appUrl) : null,
    productUrl: appUrl,
    devPortalUrl: null,
    docsCandidates: t.authGuideUrl ? [t.authGuideUrl] : [],
    toolkitSlug: t.slug,
    logo: t.logo,
    managedAuthAvailable: t.managedAuthAvailable,
    note: t.description.slice(0, 140),
  };
}

/**
 * Pick from Composio search results. An exact slug/name/domain match wins; otherwise any
 * partial matches go to the picker, so we never guess between them.
 */
export function matchToolkits(query: string, items: ToolkitSummary[]): Resolution | null {
  const domain = registrableDomain(query);
  const q = norm(domain ? domain.split(".")[0] : query);
  if (!q) return null;
  const exact = items.filter(
    (t) =>
      norm(t.slug) === q ||
      norm(t.name) === q ||
      (domain !== null && t.appUrl !== null && registrableDomain(t.appUrl) === domain),
  );
  // Several Toolkits can share a domain (linear, linear_mcp); the one named like it wins.
  const named = exact.filter((t) => norm(t.slug) === q || norm(t.name) === q);
  const one = exact.length === 1 ? exact[0] : named.length === 1 ? named[0] : null;
  if (one) return { kind: "resolved", product: fromToolkit(one), via: "composio" };
  const partial = exact.length > 1 ? exact : items.filter((t) => norm(t.slug).includes(q) || norm(t.name).includes(q));
  if (partial.length) return { kind: "candidates", candidates: partial.slice(0, 6).map(fromToolkit), via: "composio" };
  return null;
}

// --- Web fallback: a short Gemini tool loop over Tavily search ---

const WebProduct = z.object({
  productName: z.string(),
  providerName: z.string().describe("The company that runs the OAuth server"),
  domain: z.string().describe("Registrable domain, e.g. linear.app"),
  devPortalUrl: z.string().nullable().describe("Where developers register OAuth apps, if found"),
  docsCandidates: z.array(z.string()).describe("Official OAuth/developer doc URLs you found"),
  why: z.string().describe("One line on what this product is"),
});
const WebResolution = z.object({
  status: z.enum(["resolved", "ambiguous", "not_found"]),
  products: z.array(WebProduct),
});

const RESOLVE_SYSTEM =
  "You identify which software product a developer means, so another agent can research registering an OAuth app with it. Use web_search to find the product's official site and developer/OAuth documentation (at most 3 searches). Never guess between products that share a name: report them as ambiguous with 2-5 products. Report not_found when no software product with a public API matches. Finish by calling report_resolution exactly once.";

const MAX_SEARCHES = 3;

export async function resolveViaWeb(query: string, usage?: Usage): Promise<Resolution> {
  let report: z.infer<typeof WebResolution> | null = null;
  let searches = 0;
  await runToolLoop({
    models: MODELS.research(),
    system: RESOLVE_SYSTEM,
    prompt: `Query: ${JSON.stringify(query)}\nFind the product and its official OAuth/developer docs.`,
    maxTurns: 6,
    usage,
    stop: () => report !== null,
    tools: [
      {
        name: "web_search",
        description: "Search the web. Returns titles, URLs and snippets.",
        parameters: z.object({ query: z.string() }),
        run: async (args) => {
          if (++searches > MAX_SEARCHES) throw new Error("Search budget used up; call report_resolution now.");
          const results = await webSearch((args as { query: string }).query, { maxResults: 5 });
          return results.map((r) => ({ title: r.title, url: r.url, snippet: r.content.slice(0, 300) }));
        },
      },
      {
        name: "report_resolution",
        description: "Report which software product the query refers to.",
        parameters: WebResolution,
        run: async (args) => {
          report = args as z.infer<typeof WebResolution>;
          return "ok";
        },
      },
    ],
  });
  return report ? toResolution(report) : { kind: "not_found", message: "Couldn't identify this app. Try its website." };
}

function toResolution(r: z.infer<typeof WebResolution>): Resolution {
  const products: ResolvedProduct[] = r.products.map((p) => ({
    slug: slugify(p.productName),
    productName: p.productName,
    providerName: p.providerName,
    domain: registrableDomain(p.domain) ?? p.domain,
    productUrl: `https://${registrableDomain(p.domain) ?? p.domain}`,
    devPortalUrl: p.devPortalUrl,
    docsCandidates: p.docsCandidates,
    toolkitSlug: null,
    logo: null,
    managedAuthAvailable: null,
    note: p.why,
  }));
  if (r.status === "resolved" && products.length === 1) return { kind: "resolved", product: products[0], via: "web" };
  if (products.length) return { kind: "candidates", candidates: products, via: "web" };
  return { kind: "not_found", message: "Couldn't identify this app. Try its website." };
}

/** A Toolkit with no usable app URL gets its domain and portal from the web lookup; Toolkit fields stay. */
export async function withDomain(product: ResolvedProduct, usage?: Usage): Promise<ResolvedProduct> {
  if (product.domain) return product;
  const web = await resolveViaWeb(product.productName, usage).catch(() => null);
  const found = web?.kind === "resolved" ? web.product : web?.kind === "candidates" ? web.candidates[0] : null;
  if (!found) return product;
  const { domain, productUrl, providerName, devPortalUrl, docsCandidates } = found;
  return { ...product, domain, productUrl, providerName, devPortalUrl, docsCandidates: [...product.docsCandidates, ...docsCandidates] };
}

export async function resolve(query: string, usage?: Usage): Promise<Resolution> {
  const q = query.trim();
  if (!q) return { kind: "not_found", message: "Type an app name or paste its website." };
  if (hasComposioKey()) {
    const domain = registrableDomain(q);
    const term = domain ? domain.split(".")[0] : q;
    const match = matchToolkits(q, await searchToolkits(term));
    if (match) return match;
  }
  return resolveViaWeb(q, usage);
}
