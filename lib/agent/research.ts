import { z } from "zod";
import { GATE_KEYS, GateKey } from "../schema";
import { generateJson, MODELS, type Usage } from "../llm";
import { readPages, webSearch, type SearchResult } from "../search";
import { excerpt } from "./excerpt";
import { registrableDomain, type ResolvedProduct } from "./resolve";

type GateKeyT = z.infer<typeof GateKey>;

// Stage 3: gather, then extract (ADR-0004). Code runs fixed topic searches and reads the top
// official pages; then one LLM call per question group turns focused excerpts into Findings.
// A free-form tool loop resends the whole conversation every turn, which Groq's 8K tokens/min
// can't carry; this shape uses ~4 calls of ~5K tokens each, run in parallel across models.

export const QUESTIONS = {
  q_oauth: "OAuth for third-party apps? Flows, PKCE, discovery URL?",
  q_register: "Where to register an app; prerequisites (account, paid plan, company page)?",
  q_redirect: "Redirect URI rules: HTTPS-only, localhost, exact match, count limits, domain ownership?",
  q_scopes: "Main scopes an agent would use; which trigger review or verification?",
  q_gates: "Answer every Gate question for the main scopes.",
  q_distribution: "Dev vs public modes; limits before approval (users, installs, token expiry, rate limits)?",
  q_review: "Review artifacts, stated durations, fees, renewal?",
  q_listing: "Is a marketplace listing needed for production, or only discovery? Does it change limits?",
  q_ratelimits: "Rate limits that differ by app status?",
  q_changes: "Changes in the last ~18 months?",
  q_gotchas: "Community-reported pitfalls?",
} as const;
export type QuestionId = keyof typeof QUESTIONS;

export const GATE_QUESTIONS: Record<GateKeyT, string> = {
  partner_application: "Must you join a partner program or paid tier to get API/OAuth access?",
  manual_approval_uncertain: "Is API access granted at the provider's discretion with no published criteria (e.g. invite-only or partner-only APIs)? A review with published requirements is not this.",
  security_assessment: "Is a third-party security assessment or audit required?",
  business_verification: "Must the business/organization be verified?",
  publisher_verification: "Must the publisher/developer identity be verified?",
  domain_verification: "Must you prove ownership of a domain (e.g. for redirect URIs or branding)?",
  scope_verification: "Do the main scopes need a separate scope verification?",
  production_access_review: "Is there a review before users outside your own org can authorize the app (not an optional directory listing)?",
  min_installs: "Is a minimum number of installs/users required for some access?",
};

export type Finding = {
  id: string;
  questionId: QuestionId;
  gateKey?: GateKeyT;
  answer?: "yes" | "no" | "not_found";
  finding: string;
  url: string | null;
  quote: string;
  official: boolean;
  pageDate: string | null;
  appliesTo?: "production" | "listing_only" | "both"; // Gate findings only
};

export type ResearchEvent =
  | { type: "search"; payload: { query: string; results: number } }
  | { type: "fetch"; payload: { urls: string[]; failed: string[] } }
  | { type: "finding"; payload: Finding }
  | { type: "warning"; payload: { message: string } };

export type ResearchResult = {
  findings: Finding[];
  pages: Map<string, string>; // url → full page text, for the quote check
  snippets: Map<string, string>; // url → search snippet, for quotes taken from results
  unansweredGates: GateKeyT[];
  searches: number;
  urlsRead: number;
};

// --- Gather ---

type Group = { id: string; questions: QuestionId[]; query: (name: string) => string; focus: string; community?: boolean };
const GROUPS: Group[] = [
  { id: "setup", questions: ["q_oauth", "q_register", "q_redirect"], query: (n) => `${n} OAuth app create client ID redirect URI`, focus: "oauth authorization code token redirect uri url pkce create register app client id secret https localhost" },
  { id: "gates", questions: ["q_scopes", "q_gates"], query: (n) => `${n} OAuth scopes app review verification approval`, focus: "scopes sensitive restricted review verification verify approval security assessment audit partner business publisher domain install" },
  { id: "distribution", questions: ["q_distribution", "q_review", "q_listing", "q_ratelimits"], query: (n) => `${n} app distribution public marketplace listing review rate limits`, focus: "distribution public distribute marketplace directory listing review submit limits rate limit tier workspaces installs unlisted" },
  { id: "changes", questions: ["q_changes", "q_gotchas"], query: (n) => `${n} OAuth API changelog deprecation`, focus: "changelog deprecated deprecation change new update 2025 2026 breaking", community: true },
];
const EXTRA_QUERIES = [(n: string) => `${n} OAuth app review rejected problem forum`];
const MAX_PAGES = 10; // Tavily extract: 1 credit per 5 URLs
const EVIDENCE_CHARS = 13_000; // ~3.3K tokens per extraction call

// Providers often split docs across sibling domains (slack.com / slack.dev, notion.so / notion.com).
// Same name on a mainstream TLD counts as official; blogs like slack.green don't.
const SIBLING_TLDS = new Set(["com", "dev", "so", "io", "app", "co", "net", "org", "cloud"]);

function officialDomains(p: ResolvedProduct) {
  const ds = [p.domain, p.devPortalUrl, ...p.docsCandidates].map((u) => (u ? registrableDomain(u) : null));
  const domains = new Set(ds.filter((d): d is string => !!d));
  const names = new Set([...domains].map((d) => d.split(".")[0]));
  return (url: string) => {
    const d = registrableDomain(url);
    if (!d) return false;
    const [name, ...tld] = d.split(".");
    return domains.has(d) || (names.has(name) && SIBLING_TLDS.has(tld.join(".")));
  };
}

// --- Extract ---

const SourceRef = z.string().describe('Source id like "S3"');
const LlmFinding = z.object({
  question_id: z.string(),
  finding: z.string().describe("One fact, in your words"),
  source: SourceRef,
  quote: z.string().describe("Exact text copied from that source, under 40 words"),
});
const LlmGate = z.object({
  answer: z.enum(["yes", "no", "not_found"]),
  finding: z.string().describe("The answer in one sentence; for not_found, what the sources do and don't say"),
  applies_to: z.enum(["production", "listing_only", "both"]).optional().describe("Whether this applies to authorizing users outside your org, or only to an optional marketplace/directory listing"),
  source: SourceRef.nullable().describe("null only for not_found"),
  quote: z.string().describe("Exact text from the source; empty only for not_found"),
});
const GroupOut = z.object({ findings: z.array(LlmFinding) });
const GatesOut = GroupOut.extend({ gates: z.object(Object.fromEntries(GATE_KEYS.map((k) => [k, LlmGate])) as Record<GateKeyT, typeof LlmGate>) });

const EXTRACT_SYSTEM = `You extract facts about registering an OAuth app with a provider and getting it to Production (users outside the developer's own org can authorize at the volume they need).
Use only the numbered sources given. Each finding cites one source id and quotes it exactly (under 40 words, copied verbatim). One fact per finding; 1-4 findings per question; skip a question the sources don't address.
Prefer official sources. Never estimate durations a source doesn't state. Keep production access review, scope verification and marketplace listing review apart.
Only facts about this product's API and OAuth apps. Skip other products from the same company, unrelated APIs, company news and opinion.`;

const GATES_RULES = `For "gates", answer every key. "yes" or "no" needs a quote that says so explicitly. If the sources are silent, answer not_found: silence is never "no".
A gate is about registering or distributing an OAuth app. Unrelated product features (e.g. workspace admin settings) don't count. Set applies_to: "listing_only" when the requirement is only for an optional marketplace/directory listing.
${GATE_KEYS.map((k) => `- ${k}: ${GATE_QUESTIONS[k]}`).join("\n")}`;

type Source = { id: string; url: string; official: boolean; date: string | null; text: string };

export async function research(opts: {
  product: ResolvedProduct;
  deadline: number;
  emit?: (e: ResearchEvent) => void | Promise<void>;
  usage?: Usage;
}): Promise<ResearchResult> {
  const { product } = opts;
  const emit = async (e: ResearchEvent) => opts.emit?.(e);
  const name = product.productName;
  const isOfficial = officialDomains(product);

  // 1. Searches, in parallel. Each group keeps its own results for snippets.
  const queries = [...GROUPS.map((g) => g.query(name)), ...EXTRA_QUERIES.map((q) => q(name))];
  const results = await Promise.all(
    queries.map(async (query) => {
      const r = await webSearch(query, { maxResults: 6 }).catch(() => [] as SearchResult[]);
      await emit({ type: "search", payload: { query, results: r.length } });
      return r;
    }),
  );
  const snippets = new Map<string, string>();
  const dates = new Map<string, string | null>();
  for (const r of results.flat()) {
    if (!snippets.has(r.url)) snippets.set(r.url, r.content);
    dates.set(r.url, r.publishedDate);
  }

  // 2. Read the known docs plus the best official results, round-robin across groups.
  const toRead = new Set(product.docsCandidates.filter((u) => /^https?:\/\//.test(u)));
  const ranked = results.map((r) => r.filter((x) => isOfficial(x.url)).sort((a, b) => b.score - a.score));
  for (let i = 0; toRead.size < MAX_PAGES && ranked.some((r) => r[i]); i++) for (const r of ranked) if (r[i] && toRead.size < MAX_PAGES) toRead.add(r[i].url);
  const urls = [...toRead];
  const { pages: got, failed } = await readPages(urls).catch((e) => ({ pages: [], failed: urls.map((url) => ({ url, error: String(e) })) }));
  const pages = new Map(got.filter((p) => p.text.trim()).map((p) => [p.url, p.text]));
  await emit({ type: "fetch", payload: { urls, failed: failed.map((f) => f.url) } });
  if (!pages.size) await emit({ type: "warning", payload: { message: "No official pages could be read; findings rely on search snippets." } });

  // 3. One extraction call per group, in parallel.
  const findings: Finding[] = [];
  const gatesAnswered = new Set<GateKeyT>();
  const add = async (f: Omit<Finding, "id">) => {
    const finding = { ...f, id: `f${findings.length + 1}` };
    findings.push(finding);
    if (f.gateKey) gatesAnswered.add(f.gateKey);
    await emit({ type: "finding", payload: finding });
  };

  await Promise.all(
    GROUPS.map(async (g, gi) => {
      const sources = buildSources(g, gi, results, pages, snippets, dates, isOfficial);
      if (!sources.length) return;
      const byId = new Map(sources.map((s) => [s.id, s]));
      const isGates = g.id === "gates";
      const prompt = `Provider product: ${name}${product.providerName ? ` (${product.providerName})` : ""}
Questions:
${g.questions.map((q) => `- ${q}: ${QUESTIONS[q]}`).join("\n")}
${isGates ? `\n${GATES_RULES}\n` : ""}
Sources:
${sources.map((s) => `[${s.id}] ${s.url} (${s.official ? "official" : "community"}${s.date ? `, ${s.date.slice(0, 10)}` : ""})\n${s.text}`).join("\n\n")}`;
      if (Date.now() > opts.deadline) return;
      let out: z.infer<typeof GatesOut> | z.infer<typeof GroupOut>;
      try {
        out = await generateJson({ models: MODELS.research(), system: EXTRACT_SYSTEM, prompt, schema: isGates ? GatesOut : GroupOut, maxTokens: 2_500, usage: opts.usage });
      } catch (e) {
        await emit({ type: "warning", payload: { message: `Couldn't extract ${g.questions.join(", ")}: ${(e as Error).message.slice(0, 200)}` } });
        return;
      }
      for (const f of out.findings) {
        const s = byId.get(f.source);
        if (!s || !g.questions.includes(f.question_id as QuestionId) || !f.quote.trim()) continue;
        await add({ questionId: f.question_id as QuestionId, finding: f.finding, url: s.url, quote: f.quote, official: s.official, pageDate: s.date });
      }
      const gates = (out as { gates?: Record<GateKeyT, z.infer<typeof LlmGate>> }).gates;
      if (gates)
        for (const k of GATE_KEYS) {
          const a = gates[k];
          const s = a.source ? byId.get(a.source) : undefined;
          // A yes/no without a real source can't stand; downgrade it.
          const answer = a.answer !== "not_found" && (!s || !a.quote.trim()) ? "not_found" : a.answer;
          await add({ questionId: "q_gates", gateKey: k, answer, finding: a.finding, url: s?.url ?? null, quote: answer === "not_found" ? "" : a.quote, official: s?.official ?? false, pageDate: s?.date ?? null, appliesTo: a.applies_to ?? "both" });
        }
    }),
  );

  const unansweredGates = GATE_KEYS.filter((k) => !gatesAnswered.has(k));
  if (unansweredGates.length) await emit({ type: "warning", payload: { message: `Gate questions not answered: ${unansweredGates.join(", ")}` } });
  return { findings, pages, snippets, unansweredGates, searches: queries.length, urlsRead: urls.length };
}

/** Sources for one group: focused excerpts of read pages, then this group's search snippets. */
function buildSources(
  g: Group,
  gi: number,
  results: SearchResult[][],
  pages: Map<string, string>,
  snippets: Map<string, string>,
  dates: Map<string, string | null>,
  isOfficial: (url: string) => boolean,
): Source[] {
  const own = [...results[gi], ...(g.community ? results.slice(GROUPS.length).flat() : [])];
  const pageList = [...pages.entries()].map(([url, text]) => ({ url, text: excerpt(text, g.focus, 1_800) })).filter((p) => p.text);
  // Pages that matched the focus best go first.
  const hits = (t: string) => g.focus.split(" ").reduce((n, w) => n + (t.toLowerCase().includes(w) ? 1 : 0), 0);
  pageList.sort((a, b) => hits(b.text) - hits(a.text));
  const out: Source[] = [];
  let used = 0;
  const push = (url: string, text: string) => {
    if (used + text.length > EVIDENCE_CHARS || out.some((s) => s.url === url)) return;
    out.push({ id: `S${out.length + 1}`, url, official: isOfficial(url), date: dates.get(url) ?? null, text });
    used += text.length;
  };
  for (const p of pageList.slice(0, 5)) push(p.url, p.text);
  for (const r of own) if (!pages.has(r.url)) push(r.url, (snippets.get(r.url) ?? "").slice(0, 600));
  return out;
}
