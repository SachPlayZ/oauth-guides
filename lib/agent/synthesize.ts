import { z } from "zod";
import { generateJson, MODELS, type Usage } from "../llm";
import { ArtifactKey, GATE_KEYS, GateKey, Range, RequirementKey, Step, type Claim, type Guide } from "../schema";
import { GATE_QUESTIONS } from "./research";
import type { ResolvedProduct } from "./resolve";

// Stage 5: Claims → Guide. Two compact calls (rows + verdict, then steps + gotchas) to stay under
// Groq's tokens/minute; code fills defaults, drops bad citations and never lets the LLM compute levels.

type GateKeyT = z.infer<typeof GateKey>;
const Ids = z.array(z.string()).describe("Claim ids");

const RowsOut = z.object({
  oauth: z.object({
    supported: z.boolean(),
    protocol: z.enum(["oauth2", "oidc", "oauth1", "none", "unknown"]),
    pkce: z.enum(["required", "supported", "not_supported", "unknown"]),
    alternatives: z.array(z.string()).describe("Other auth options, e.g. API key"),
    claimIds: Ids,
  }),
  usageRows: z
    .array(
      z.object({
        id: z.string().describe("short slug"),
        usage: z.string().describe('What the agent does, e.g. "Read & send email"'),
        exampleScopes: z.array(z.string()),
        gates: z.array(z.object({ key: GateKey, answer: z.enum(["yes", "no"]), claimIds: Ids })).describe("Only gates a Claim settles; the rest become unknown"),
        requirements: z.array(z.object({ key: RequirementKey, label: z.string(), claimIds: Ids })),
        blockingLimits: z.array(z.object({ text: z.string(), claimIds: Ids })).describe("Limits so severe without approval that they block Production"),
        artifacts: z.array(z.object({ key: ArtifactKey, label: z.string(), estMinutes: z.number(), claimIds: Ids })).describe("Things you must prepare for a review"),
        notes: z.string(),
      }),
    )
    .min(1)
    .max(3),
  defaultUsageId: z.string(),
  defaultUsageReason: z.object({ text: z.string(), claimIds: Ids }),
  oneLiner: z.string().describe("The verdict in one sentence"),
  approvalWait: z.object({ min: z.number(), max: z.number(), unit: Range.shape.unit, claimIds: Ids }).nullable(),
  costs: z.array(z.object({ text: z.string(), claimIds: Ids })),
  preApprovalLimits: z.array(z.object({ text: z.string(), claimIds: Ids })),
});

const StepsOut = z.object({
  steps: z.array(Step.omit({ id: true, url: true }).extend({ url: z.string().nullable() })).min(2).max(10),
  whileYouWait: z.array(z.object({ text: z.string(), claimIds: Ids })),
  gotchas: z.array(z.object({ text: z.string(), severity: z.enum(["info", "warn", "blocker"]), claimIds: Ids })),
  unknowns: z.array(z.string()).describe("What we couldn't verify, and why"),
});

const COMMON = `You write a Guide for a developer registering their own OAuth app with a provider and getting it to Production: users outside their own org can authorize at the volume they need.
Use only the Claims given and cite their ids. No facts without a Claim. A Claim marked [unverified] is weak; prefer others.`;

const ROWS_SYSTEM = `${COMMON}
Usage rows: 1-3 typical agent use cases with different scopes (e.g. sign-in only vs reading data). The default row is the most typical agent use, not sign-in.
Gates: for each row, list only gates that a Claim settles as yes or no. Gates are per row: a review or assessment triggered by certain scopes applies only to rows that use those scopes (sign-in-only rows usually need none). A Claim marked "(marketplace listing only)" counts for a row only if that row needs the listing (e.g. because unlisted apps hit a blocking limit). Silence is never "no".
Gate keys:
${GATE_KEYS.map((k) => `- ${k}: ${GATE_QUESTIONS[k]}`).join("\n")}
Production means users outside the developer's own org can authorize the app at the volume they need. An optional marketplace/directory listing review is not production_access_review, and its requirements (installs, pen tests, scope checks) are not gates for a row. If unlisted apps are severely limited (e.g. rate limits), record that as a blockingLimit instead.
approvalWait is null unless an official [documented] Claim states a duration for a review the row needs. Keep production access review, scope verification and listing review apart.
oneLiner must agree with the gates you set: never say a review, verification or gate is not needed unless a Claim settles it as "no"; if gates are unsettled, say what is unknown.`;

const STEPS_SYSTEM = `${COMMON}
Steps: concrete and in order, from preparing to launch: the portal, field names, what to paste where. Estimate estMinutes for hands-on work; the "wait" phase has estMinutes null.
Owner: "you" for identity, legal, payment, 2FA, accepting terms, final submit. "setup_agent_drafts" for writing justifications, privacy-policy checklists, demo scripts, field values. "setup_agent" for navigation, form-filling, redirect URI checks, config validation. takeoverPoints: moments a browser agent must hand back to you (sign-in, 2FA, CAPTCHA, payment).
whileYouWait: what to do during review (e.g. keep using Composio managed auth, test users).
unknowns: each thing the Claims don't settle, saying what's missing.`;

const claimLine = (c: Claim) => `${c.id} [${c.evidence}${c.verifier.status === "partial" ? ", partial" : ""}] ${c.text}`;

export async function synthesize(opts: {
  product: ResolvedProduct;
  claims: Claim[];
  notFound: string[]; // "<gate key>: where we looked"
  composio: Guide["composio"];
  usage?: Usage;
}): Promise<Omit<Guide, "meta">> {
  const { product, claims, composio } = opts;
  const ids = new Set(claims.map((c) => c.id));
  const header = `Provider product: ${product.productName}${product.providerName ? ` (${product.providerName})` : ""}
Developer portal: ${product.devPortalUrl ?? "unknown"}
Composio: ${composio ? `Toolkit "${composio.toolkitSlug}", managed auth ${composio.managedAuthAvailable ? "available" : "not available"}. Callback URL: ${composio.callbackUrl}` : "no Toolkit; the guide ends at \"OAuth app ready\"."}

Claims:
${claims.map(claimLine).join("\n")}`;

  const rows = await generateJson({
    models: MODELS.synth(),
    system: ROWS_SYSTEM,
    prompt: `${header}\n\nGate questions with no evidence found:\n${opts.notFound.join("\n") || "none"}`,
    schema: RowsOut,
    maxTokens: 3_000,
    usage: opts.usage,
  });
  const def = rows.usageRows.find((r) => r.id === rows.defaultUsageId) ?? rows.usageRows[0];
  const steps = await generateJson({
    models: MODELS.synth(),
    system: STEPS_SYSTEM,
    prompt: `${header}\n\nDefault usage: ${def.usage} (scopes: ${def.exampleScopes.join(", ") || "n/a"}). Settled gates: ${def.gates.map((g) => `${g.key}=${g.answer}`).join(", ") || "none"}.`,
    schema: StepsOut,
    maxTokens: 3_000,
    usage: opts.usage,
  });

  // --- Clean up: keep only real citations; unsettled gates become unknown. ---
  const cite = (xs: string[]) => [...new Set(xs.filter((x) => ids.has(x)))];
  const cited = <T extends { claimIds: string[] }>(xs: T[]) => xs.map((x) => ({ ...x, claimIds: cite(x.claimIds) }));
  const isUrl = (u: string | null | undefined) => !!u && z.url().safeParse(u).success;

  const usageRows = rows.usageRows.map((r) => {
    const settled = new Map<GateKeyT, { answer: "yes" | "no"; claimIds: string[] }>();
    for (const g of r.gates) {
      const claimIds = cite(g.claimIds);
      if (claimIds.length && !settled.has(g.key)) settled.set(g.key, { answer: g.answer, claimIds });
    }
    return {
      id: r.id,
      usage: r.usage,
      exampleScopes: r.exampleScopes,
      gates: GATE_KEYS.map((key) => ({ key, ...(settled.get(key) ?? { answer: "unknown" as const, claimIds: [] }) })),
      requirements: cited(r.requirements),
      blockingLimits: cited(r.blockingLimits).filter((b) => b.claimIds.length),
      artifacts: cited(r.artifacts),
      notes: r.notes,
    };
  });
  const defaultUsageId = usageRows.some((r) => r.id === rows.defaultUsageId) ? rows.defaultUsageId : usageRows[0].id;
  // A wait only stands on official evidence: third-party blogs misquote review times.
  const strong = (id: string) => ["documented", "tested"].includes(claims.find((c) => c.id === id)?.evidence ?? "");
  const wait = rows.approvalWait && cite(rows.approvalWait.claimIds).some(strong) ? rows.approvalWait : null;

  // Unknown gates on the default row are always listed, whatever the model wrote.
  const defRow = usageRows.find((r) => r.id === defaultUsageId)!;
  const gateUnknowns = defRow.gates.filter((g) => g.answer === "unknown").map((g) => `Not found in sources: ${GATE_QUESTIONS[g.key]}`);

  return {
    slug: product.slug,
    productName: product.productName,
    providerName: product.providerName ?? product.productName,
    ...(isUrl(product.productUrl) ? { productUrl: product.productUrl! } : {}),
    ...(isUrl(product.devPortalUrl) ? { devPortalUrl: product.devPortalUrl! } : {}),
    oauth: { ...rows.oauth, dynamicClientRegistration: null, claimIds: cite(rows.oauth.claimIds) },
    composio,
    usageRows,
    defaultUsageId,
    defaultUsageReason: { ...rows.defaultUsageReason, claimIds: cite(rows.defaultUsageReason.claimIds) },
    verdict: {
      oneLiner: rows.oneLiner,
      approvalWait: wait ? { range: { min: wait.min, max: wait.max, unit: wait.unit }, claimIds: cite(wait.claimIds) } : null,
      costs: cited(rows.costs),
    },
    preApprovalLimits: cited(rows.preApprovalLimits),
    steps: steps.steps.map((s, i) => {
      const { url, ...rest } = s;
      return { ...rest, id: `s${i + 1}`, claimIds: cite(s.claimIds), ...(isUrl(url) ? { url: url! } : {}) };
    }),
    whileYouWait: cited(steps.whileYouWait),
    gotchas: cited(steps.gotchas),
    unknowns: [...new Set([...gateUnknowns, ...steps.unknowns])],
    claims,
  };
}
