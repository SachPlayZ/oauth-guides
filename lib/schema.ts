import { z } from "zod";

// Single source of truth for the Guide format. Terms follow GLOSSARY.md.

export const Evidence = z.enum(["tested", "documented", "reported", "unverified"]);
export const StepOwner = z.enum(["setup_agent", "setup_agent_drafts", "you"]);
export const Answer = z.enum(["yes", "no", "unknown"]);

// Gate questions every Usage row must answer (ADR-0001). Level if answered yes lives in rubric.ts.
export const GateKey = z.enum([
  "partner_application",
  "manual_approval_uncertain",
  "security_assessment",
  "business_verification",
  "publisher_verification",
  "domain_verification",
  "scope_verification",
  "production_access_review",
  "min_installs",
]);
export const GATE_KEYS = GateKey.options;

// R1-level config items: present or not.
export const RequirementKey = z.enum([
  "https_redirect",
  "admin_consent",
  "test_user_cap",
  "privacy_policy",
  "terms_of_service",
  "homepage",
]);
export const ArtifactKey = z.enum(["demo_video", "scope_justification", "security_questionnaire", "other"]);

const ClaimRefs = z.array(z.string());
export const Range = z.object({
  min: z.number().nonnegative(),
  max: z.number().nonnegative(),
  unit: z.enum(["minutes", "hours", "days", "weeks"]),
});
const Level = z.number().int().min(0).max(5);

export const Source = z.object({
  url: z.url(),
  title: z.string().optional(),
  quote: z.string().max(400),
  official: z.boolean(),
  retrievedAt: z.string(),
  pageDate: z.string().optional(),
  quoteMatched: z.boolean().optional(), // set by quote check
});

export const Claim = z.object({
  id: z.string(),
  text: z.string(),
  evidence: Evidence,
  sources: z.array(Source),
  testedRef: z.string().optional(), // evidence/<slug>/attempt.md#step or probe id
  verifier: z.object({
    status: z.enum(["supported", "partial", "unsupported", "conflicting", "not_checked"]),
    note: z.string().optional(),
  }),
  checkedAt: z.string(),
});

export const GateAnswer = z
  .object({ key: GateKey, answer: Answer, claimIds: ClaimRefs })
  .refine((g) => g.answer === "unknown" || g.claimIds.length > 0, {
    message: "a yes/no Gate answer must cite a Claim",
    path: ["claimIds"],
  });

export const UsageRow = z
  .object({
    id: z.string(),
    usage: z.string(),
    exampleScopes: z.array(z.string()),
    gates: z.array(GateAnswer),
    requirements: z.array(z.object({ key: RequirementKey, label: z.string(), claimIds: ClaimRefs })),
    blockingLimits: z.array(z.object({ text: z.string(), claimIds: ClaimRefs.min(1) })),
    artifacts: z.array(z.object({ key: ArtifactKey, label: z.string(), estMinutes: z.number(), claimIds: ClaimRefs })),
    notes: z.string(),
    // computed by rubric.ts
    level: Level.optional(),
    levelCeiling: Level.optional(),
  })
  .superRefine((row, ctx) => {
    for (const key of GATE_KEYS) {
      const n = row.gates.filter((g) => g.key === key).length;
      if (n !== 1) ctx.addIssue({ code: "custom", message: `gate "${key}" answered ${n} times, expected 1`, path: ["gates"] });
    }
  });

export const Step = z.object({
  id: z.string(),
  phase: z.enum(["prepare", "create", "configure", "connect_composio", "test", "submit", "wait", "launch"]),
  title: z.string(),
  detail: z.string(),
  owner: StepOwner,
  takeoverPoints: z.array(z.string()),
  estMinutes: z.number().nullable(),
  url: z.url().optional(),
  blockers: z.array(z.object({ text: z.string(), workaround: z.string() })),
  claimIds: ClaimRefs,
});

export const Computed = z.object({
  level: Level.nullable(),
  levelCeiling: Level.nullable(),
  handsOnEffort: Range,
  confidence: z.enum(["high", "medium", "low"]),
  lastChecked: z.string(),
  startHereStepId: z.string().nullable(),
});

export const Guide = z
  .object({
    slug: z.string(),
    productName: z.string(),
    providerName: z.string(),
    productUrl: z.url().optional(),
    devPortalUrl: z.url().optional(),

    oauth: z.object({
      supported: z.boolean(),
      protocol: z.enum(["oauth2", "oidc", "oauth1", "none", "unknown"]),
      pkce: z.enum(["required", "supported", "not_supported", "unknown"]),
      discoveryUrl: z.url().optional(),
      dynamicClientRegistration: z.boolean().nullable(),
      alternatives: z.array(z.string()),
      claimIds: ClaimRefs,
    }),

    // null when no matching Composio Toolkit (ADR-0003)
    composio: z
      .object({
        toolkitSlug: z.string(),
        managedAuthAvailable: z.boolean().nullable(),
        authSchemes: z.array(z.string()),
        callbackUrl: z.string(),
        authGuideUrl: z.url().optional(),
        claimIds: ClaimRefs,
      })
      .nullable(),

    usageRows: z.array(UsageRow).min(1),
    defaultUsageId: z.string(),
    defaultUsageReason: z.object({ text: z.string(), claimIds: ClaimRefs }),

    verdict: z.object({
      oneLiner: z.string(),
      approvalWait: z.object({ range: Range, claimIds: ClaimRefs.min(1) }).nullable(), // null → "Unknown"
      costs: z.array(z.object({ text: z.string(), claimIds: ClaimRefs })),
      computed: Computed.optional(),
    }),

    preApprovalLimits: z.array(z.object({ text: z.string(), claimIds: ClaimRefs })),
    steps: z.array(Step),
    whileYouWait: z.array(z.object({ text: z.string(), claimIds: ClaimRefs })),
    gotchas: z.array(
      z.object({ text: z.string(), severity: z.enum(["info", "warn", "blocker"]), claimIds: ClaimRefs }),
    ),
    unknowns: z.array(z.string()),
    claims: z.array(Claim),

    meta: z.object({
      generatedAt: z.string(),
      origin: z.enum(["curated", "live"]),
      reviewStatus: z.enum(["reviewed", "unreviewed"]),
      model: z.string().optional(),
      runId: z.string().optional(),
      durationSec: z.number().optional(),
      costUsd: z.number().optional(),
      unansweredQuestions: z.array(z.string()).optional(),
    }),
  })
  .superRefine((g, ctx) => {
    if (!g.usageRows.some((r) => r.id === g.defaultUsageId)) {
      ctx.addIssue({ code: "custom", message: `defaultUsageId "${g.defaultUsageId}" matches no Usage row`, path: ["defaultUsageId"] });
    }
    const ids = new Set(g.claims.map((c) => c.id));
    if (ids.size !== g.claims.length) ctx.addIssue({ code: "custom", message: "duplicate Claim ids", path: ["claims"] });
    for (const ref of collectClaimRefs(g)) {
      if (!ids.has(ref)) ctx.addIssue({ code: "custom", message: `unknown Claim id "${ref}"`, path: ["claims"] });
    }
  });
export type Guide = z.infer<typeof Guide>;
export type UsageRow = z.infer<typeof UsageRow>;
export type Claim = z.infer<typeof Claim>;
export type Computed = z.infer<typeof Computed>;

/** Every id referenced from any `claimIds` array in the Guide. */
export function collectClaimRefs(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => collectClaimRefs(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "claimIds" && Array.isArray(v)) v.forEach((id) => out.add(String(id)));
      else collectClaimRefs(v, out);
    }
  }
  return out;
}

export const JobEvent = z.object({
  id: z.number(),
  ts: z.string(),
  type: z.enum(["stage_started", "stage_done", "probe", "search", "fetch", "finding", "warning", "candidates", "guide_ready", "error"]),
  payload: z.record(z.string(), z.unknown()),
});
export type JobEvent = z.infer<typeof JobEvent>;
