import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { hasComposioKey, searchToolkits, type ToolkitSummary } from "../composio";

// Stage 0: turn free text (a name or URL) into one Provider product, a short list to pick from,
// or "not found". Composio Toolkits first, then one LLM web-search call (ADR-0003).

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
  return {
    slug: t.slug,
    productName: t.name,
    providerName: null,
    domain: t.appUrl ? registrableDomain(t.appUrl) : null,
    productUrl: t.appUrl,
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
  if (exact.length === 1) return { kind: "resolved", product: fromToolkit(exact[0]), via: "composio" };
  const partial = exact.length > 1 ? exact : items.filter((t) => norm(t.slug).includes(q) || norm(t.name).includes(q));
  if (partial.length) return { kind: "candidates", candidates: partial.slice(0, 6).map(fromToolkit), via: "composio" };
  return null;
}

// --- Web fallback: one small Claude call with web search ---

const WebProduct = z.object({
  productName: z.string(),
  providerName: z.string(),
  domain: z.string(),
  devPortalUrl: z.string().nullable(),
  docsCandidates: z.array(z.string()),
  why: z.string(),
});
const WebResolution = z.object({
  status: z.enum(["resolved", "ambiguous", "not_found"]),
  products: z.array(WebProduct),
});

const REPORT_TOOL: Anthropic.Tool = {
  name: "report_resolution",
  description:
    "Report which software product the query refers to. status=resolved with exactly one product when you are confident; ambiguous with 2–5 products when several plausible products share the name; not_found when no software product with a public API matches.",
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["resolved", "ambiguous", "not_found"] },
      products: {
        type: "array",
        items: {
          type: "object",
          properties: {
            productName: { type: "string" },
            providerName: { type: "string", description: "The company that runs the OAuth server" },
            domain: { type: "string", description: "Registrable domain, e.g. linear.app" },
            devPortalUrl: { type: ["string", "null"], description: "Where developers register OAuth apps" },
            docsCandidates: { type: "array", items: { type: "string" }, description: "Official OAuth/developer doc URLs you found" },
            why: { type: "string", description: "One line on what this product is" },
          },
          required: ["productName", "providerName", "domain", "devPortalUrl", "docsCandidates", "why"],
        },
      },
    },
    required: ["status", "products"],
  },
};

const RESOLVE_SYSTEM =
  "You identify which software product a developer means, so another agent can research registering an OAuth app with it. Use web search to find the product's official site and developer/OAuth documentation. Never guess between products that share a name: report them as ambiguous. When done, call report_resolution exactly once.";

export async function resolveViaWeb(query: string, client = new Anthropic()): Promise<Resolution> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Query: ${JSON.stringify(query)}\nFind the product and its official OAuth/developer docs.` },
  ];
  const tools: Anthropic.ToolUnion[] = [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }, REPORT_TOOL];

  for (let turn = 0; turn < 6; turn++) {
    const res = await client.messages.create({
      model: process.env.MODEL_RESEARCH || "claude-sonnet-5-5",
      max_tokens: 4096,
      system: RESOLVE_SYSTEM,
      tools,
      tool_choice: { type: "auto" },
      output_config: { effort: "low" },
      messages,
    });
    const report = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === REPORT_TOOL.name);
    if (report) return toResolution(WebResolution.parse(report.input));
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content }); // let server tools continue
  }
  return { kind: "not_found", message: "Couldn't identify this app. Try its website." };
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

export async function resolve(query: string): Promise<Resolution> {
  const q = query.trim();
  if (!q) return { kind: "not_found", message: "Type an app name or paste its website." };
  if (hasComposioKey()) {
    const domain = registrableDomain(q);
    const term = domain ? domain.split(".")[0] : q;
    const match = matchToolkits(q, await searchToolkits(term));
    if (match) return match;
  }
  return resolveViaWeb(q);
}
