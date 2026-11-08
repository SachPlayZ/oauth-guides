import type { ToolkitDetail } from "../composio";
import { describeProbe, type Probe } from "../probes";
import type { Claim } from "../schema";
import { checkQuote } from "./quotecheck";
import type { Finding, ResearchResult } from "./research";

// Findings, probes and Composio facts → Claims with Evidence labels (PLAN §6).
// Claim ids keep their origin: f* = research finding, p* = probe, k* = Composio.

const today = () => new Date().toISOString();

/** Quote-checked Claims from findings. not_found Gate findings aren't Claims; they become unknowns. */
export function findingClaims(r: ResearchResult): Claim[] {
  return r.findings
    .filter((f) => f.answer !== "not_found" && f.url && f.quote)
    .map((f) => {
      const matched = checkQuote(f.quote, f.url, [r.pages, r.snippets]);
      return {
        id: f.id,
        text: f.gateKey ? `${f.finding}${f.appliesTo === "listing_only" ? " (marketplace listing only)" : ""}` : f.finding,
        evidence: matched === false ? "unverified" : f.official ? "documented" : "reported",
        sources: [
          {
            url: f.url!,
            quote: f.quote.slice(0, 400),
            official: f.official,
            retrievedAt: today(),
            ...(f.pageDate ? { pageDate: f.pageDate } : {}),
            ...(matched === null ? {} : { quoteMatched: matched }),
          },
        ],
        verifier: { status: "not_checked", ...(matched === false ? { note: "Quote not found on the page" } : matched === null ? { note: "Page not machine-checkable" } : {}) },
        checkedAt: today(),
      } satisfies Claim;
    });
}

/** Tested Claims: discovery documents found, and dev portal / docs reachability. */
export function probeClaims(probes: Probe[]): Claim[] {
  return probes
    .filter((p) => p.kind === "reachability" || p.found)
    .map((p, i) => ({
      id: `p${i + 1}`,
      text: describeProbe(p),
      evidence: "tested",
      sources: [
        {
          url: p.url,
          quote: (p.kind === "discovery" ? p.snippet ?? "" : `HTTP ${p.status ?? "none"} → ${p.finalUrl ?? p.url}`).slice(0, 400),
          official: true,
          retrievedAt: p.checkedAt,
        },
      ],
      testedRef: p.id,
      verifier: { status: "supported", note: "Deterministic probe" },
      checkedAt: p.checkedAt,
    }));
}

export const COMPOSIO_CUSTOM_AUTH_DOC = "https://docs.composio.dev/docs/using-custom-auth-configuration";

export function composioClaims(t: ToolkitDetail): Claim[] {
  const url = t.authGuideUrl ?? COMPOSIO_CUSTOM_AUTH_DOC;
  const mk = (id: string, text: string, quote: string): Claim => ({
    id,
    text,
    evidence: "documented",
    sources: [{ url, quote, official: true, retrievedAt: today() }],
    verifier: { status: "supported", note: "From the Composio Toolkits API" },
    checkedAt: today(),
  });
  return [
    mk("k1", `Composio's ${t.name} Toolkit supports ${t.authSchemes.join(", ") || "no listed"} auth.`, `auth_schemes: ${t.authSchemes.join(", ")}`),
    mk("k2", t.managedAuthAvailable ? `Composio offers managed auth for ${t.name}.` : `Composio has no managed auth for ${t.name}; you need your own OAuth app.`, `managed auth: ${t.managedAuthAvailable}`),
  ];
}

/** Questions with no usable finding, for meta.unansweredQuestions. */
export function unanswered(findings: Finding[], questionIds: string[]): string[] {
  const hit = new Set(findings.filter((f) => f.answer !== "not_found").map((f) => f.questionId));
  return questionIds.filter((q) => !hit.has(q as Finding["questionId"]));
}
