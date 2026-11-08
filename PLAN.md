# PLAN.md — OAuth Runway

> **OAuth Runway**: how long until your users can connect a product with *your* OAuth app, and what's in the way.
> Take-home: Composio APM Integrations ([BRIEF.md](BRIEF.md)). Budget: 6–8h. Revised 2026-11-09 after a grilling session.
> Vocabulary: [GLOSSARY.md](GLOSSARY.md). Decisions: [docs/adr/](docs/adr/).

---

## 0. How to use this file

- **Human:** §1–6 are the thinking; copy the decisions into the README. §17–18 are hands-on work. §16 is the build order.
- **Coding agent:**
  - Build the milestones in §16 in order, and don't start the next until the acceptance criteria pass.
  - `lib/schema.ts` is the single source of truth.
  - Use the GLOSSARY terms in code and UI. Never write bare "app", "agent" or "tier".
  - Never commit secrets. Keys come from env only, and `.env.example` has blank values.
  - Write boring, working code. The UI is clean and docs-like.

---

## 1. Problem

A developer building an agent on Composio starts with **Managed auth**. Before launch, many need their own **OAuth app** because:
- the Toolkit has no managed app;
- they want their own brand on the consent screen;
- they need custom scopes;
- they need a dedicated rate-limit quota or faster polling triggers.

Registering is minutes for some **Providers** (GitHub) and weeks for others (Google restricted scopes need verification plus a paid assessment; some APIs are partner-gated). Provider docs explain the clicks. They rarely say upfront **how long it takes, what will block you, what to do while you wait, and what a Setup agent can do for you.** That gap is the product.

## 2. What we're building

1. **Library:** a directory of ~100 OAuth products seeded from Composio Toolkits, with honest status:
   - Reviewed (4 curated Guides)
   - Unreviewed (generated live)
   - Not generated yet, with a Generate button
2. **Live generation:** a developer types a name or URL, *including products that aren't Composio Toolkits* (ADR-0003). The **Research agent** investigates while the user watches the progress stream.
3. **Guide page:** a permalink, Markdown export, and a checklist. The top answers:
   - **How hard?** The Runway level (R0–R5), shown as a range when Gate answers are unknown.
   - **How long?** Hands-on effort, approval wait, and Cost, shown separately.
   - **What will bite me?** Requirements, Blocking limits, gotchas, and blockers with workarounds.
   - **Who does what?** Step owners and Takeover points, observed from real Setup agent attempts.
   - **Start here:** the first step you own, with its link.

Every Claim carries an Evidence label, a source, and a checked date.

## 3. Scope decisions (→ README)

| Decision | Why |
|---|---|
| Target moment: **moving off Composio Managed auth to your own OAuth app before launch** | That's when the pain hits. It keeps Guides Composio-specific (callback URL, Auth config, migration gotcha). |
| **Any Provider product, Toolkit optional** (ADR-0003) | Reviewers will submit unfamiliar apps. Refusing non-Toolkits would fail the brief. |
| **Depth over breadth:** 4 curated Guides (GitHub, Slack, Gmail, Notion) + live generation | The brief grades judgment about evidence, so verified depth beats 100 shallow pages. |
| **Verdict first, steps second** | Steps exist in provider docs. Timelines, gates and a plan for the wait don't. |
| **Effort, wait and Cost shown separately** | "2h work + 4–6 weeks wait + $500 fee" calls for different planning than "2 days of work". |
| **Runway level per Usage row** | Google sign-in is R0; reading Gmail is R4. Same Provider, different path. |
| **Runway level derived in code from Gate answers** (ADR-0001) | The LLM states facts with Claims; code derives the level. This makes levels explainable and comparable. |
| **Gate questions answered yes/no/unknown, each with a Claim** | A missing fact must not read as "easy". An unknown widens the level into a range. |
| **Cost is its own axis** | Paying is deterministic, while R5 means "weeks to never". |
| **"Runway level", not "tier"** | "Tier" already means CASA tiers, rate-limit tiers and plans. |
| **Setup agent attempts real setups; Takeover points become Step owners** | The brief says "attempt as much of the setup as practical". The agent-vs-you split is observed, not assumed. |
| **Evidence labels on every Claim** plus "What we couldn't verify" | Honest uncertainty beats confident wrongness. |
| **Guide versions are only added; pages show the latest Reviewed version** | Live runs never overwrite hand-reviewed content. |
| **Effort is summed in code; wait comes only from a Claim stating a duration** | No invented numbers. A missing duration shows "Unknown — Provider states no timeline". |
| Live generation does **not** log into provider portals | Slow, needs credentials, and unsafe in a public demo. Setup agent attempts happen offline, for curated Guides only. |
| **Out of scope** | Real approvals, paid accounts, user auth, editing in-app, Provider-level Claim reuse, a demo video. |

## 4. Concepts

See [GLOSSARY.md](GLOSSARY.md). The key distinctions:
- **Provider** (the company) vs **Toolkit** (the Composio integration) vs **OAuth app** (the developer's client registration).
- **Research agent** (our pipeline) vs **Setup agent** (the developer's browser or coding agent).
- **Production access review** vs **Scope verification** vs **Listing review**.
- **Production** means users outside your own org can authorize, at the volume the Usage row needs.

## 5. Runway level (`lib/rubric.ts`, deterministic)

Each Usage row has:
- `gates[]`: one answer per **Gate question**: `yes | no | unknown`, plus `claimIds`.
- `requirements[]`: R1-level config items, present or not.
- `blockingLimits[]`: Pre-approval limits that break this row's own purpose.

**Gate questions** (fixed; every row answers all of them):

| Key | Level if yes |
|---|---|
| `partner_application` | R5 |
| `manual_approval_uncertain` (manual approval with no guaranteed outcome) | R5 |
| `security_assessment` | R4 |
| `business_verification` | R3 |
| `publisher_verification` | R3 |
| `domain_verification` | R3 |
| `scope_verification` | R3 |
| `production_access_review` | R2 |
| `min_installs` | R2 |

**Other inputs:**
- Any Blocking limit (including a Listing review a limit forces you into): R2.
- R1 requirements: `https_redirect`, `admin_consent`, `test_user_cap`, `privacy_policy`, `terms_of_service`, `homepage`.
- No Gate answered yes and no requirement or limit: R0.

**Computation:**
```
level    = max(levels of gates answered yes, 2 if any blockingLimit, 1 if any requirement, 0)
ceiling  = max(level, levels of gates answered unknown)
display  = level == ceiling ? "R{level}" : "R{level}–R{ceiling}?"
```

**Not level-raising:**
- **Review artifacts** (`demo_video`, `scope_justification`, `security_questionnaire`) add hands-on effort.
- **Cost** (paid plan, assessment fees) is shown as a badge.

**Default Usage row:** the row needing the broadest scope among the Toolkit's most common actions. The LLM proposes 2–4 rows and states the default with a one-line reason and a Claim.

**Confidence** is computed over the **Verdict-relevant Claims**, which are the Claims cited by the Default Usage row's Gate answers:
- **high:** all are Tested or Documented, and the verifier marked each one supported.
- **low:** any is Unverified or conflicting, *or* any Gate answer is unknown.
- **medium:** everything else, including any Reported Claim.

| Level | Label | Typical wait |
|---|---|---|
| R5 | Gated | Weeks to never |
| R4 | Security assessment | Weeks, with fees |
| R3 | Verification | Days to weeks |
| R2 | Review | Days |
| R1 | Self-serve with limits | Minutes to hours |
| R0 | Instant | Minutes |

**No OAuth support:** the level is "N/A", and the Guide lists alternatives (API key, service account).

## 6. Evidence model

| Label | Meaning | Color |
|---|---|---|
| **Tested** | We did it: a Setup agent attempt, a hand attempt, or a deterministic probe. Has a date and a screenshot or log. | Green |
| **Documented** | Official Provider or Composio docs, with URL and a short supporting quote | Blue |
| **Reported** | Community or third-party source | Amber |
| **Unverified** | Agent inference, or a quote we couldn't match on the page | Grey, with "why" |

Rules:
- Conflicting sources are both shown, with a gotcha "Sources disagree".
- "Last checked" is the oldest Verdict-relevant Claim date.
- A "no" Gate answer needs evidence just as a "yes" does.

---

## 7. Guide schema (`lib/schema.ts`, zod)

```ts
import { z } from "zod";

export const Evidence = z.enum(["tested", "documented", "reported", "unverified"]);
export const StepOwner = z.enum(["setup_agent", "setup_agent_drafts", "you"]);
export const Answer = z.enum(["yes", "no", "unknown"]);
export const GateKey = z.enum([
  "partner_application", "manual_approval_uncertain", "security_assessment",
  "business_verification", "publisher_verification", "domain_verification", "scope_verification",
  "production_access_review", "min_installs",
]);
export const RequirementKey = z.enum([
  "https_redirect", "admin_consent", "test_user_cap", "privacy_policy", "terms_of_service", "homepage",
]);
export const ArtifactKey = z.enum(["demo_video", "scope_justification", "security_questionnaire", "other"]);

const ClaimRefs = z.array(z.string());
const Range = z.object({ min: z.number(), max: z.number(), unit: z.enum(["minutes", "hours", "days", "weeks"]) });

export const Source = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  quote: z.string().max(400),
  official: z.boolean(),
  retrievedAt: z.string(),
  pageDate: z.string().optional(),
  quoteMatched: z.boolean().optional(),   // set by quote check
});

export const Claim = z.object({
  id: z.string(),
  text: z.string(),
  evidence: Evidence,
  sources: z.array(Source),
  testedRef: z.string().optional(),       // evidence/<slug>/attempt.md#step or probe id
  verifier: z.object({
    status: z.enum(["supported", "partial", "unsupported", "conflicting", "not_checked"]),
    note: z.string().optional(),
  }),
  checkedAt: z.string(),
});

export const UsageRow = z.object({
  id: z.string(),
  usage: z.string(),                      // "Sign in only", "Read & send email"
  exampleScopes: z.array(z.string()),
  gates: z.array(z.object({ key: GateKey, answer: Answer, claimIds: ClaimRefs })), // all GateKeys, exactly once
  requirements: z.array(z.object({ key: RequirementKey, label: z.string(), claimIds: ClaimRefs })),
  blockingLimits: z.array(z.object({ text: z.string(), claimIds: ClaimRefs })),
  artifacts: z.array(z.object({ key: ArtifactKey, label: z.string(), estMinutes: z.number(), claimIds: ClaimRefs })),
  notes: z.string(),
  // computed by rubric.ts:
  level: z.number().int().min(0).max(5).optional(),
  levelCeiling: z.number().int().min(0).max(5).optional(),
});

export const Guide = z.object({
  slug: z.string(),
  productName: z.string(),               // "Gmail"
  providerName: z.string(),              // "Google"
  productUrl: z.string().url().optional(),
  devPortalUrl: z.string().url().optional(),

  oauth: z.object({
    supported: z.boolean(),
    protocol: z.enum(["oauth2", "oidc", "oauth1", "none", "unknown"]),
    pkce: z.enum(["required", "supported", "not_supported", "unknown"]),
    discoveryUrl: z.string().url().optional(),
    dynamicClientRegistration: z.boolean().nullable(),
    alternatives: z.array(z.string()),
    claimIds: ClaimRefs,
  }),

  composio: z.object({                    // null when no matching Toolkit (ADR-0003)
    toolkitSlug: z.string(),
    managedAuthAvailable: z.boolean().nullable(),
    authSchemes: z.array(z.string()),
    callbackUrl: z.string(),
    authGuideUrl: z.string().url().optional(),
  }).nullable(),

  usageRows: z.array(UsageRow).min(1),
  defaultUsageId: z.string(),
  defaultUsageReason: z.object({ text: z.string(), claimIds: ClaimRefs }),

  verdict: z.object({
    oneLiner: z.string(),
    approvalWait: z.object({ range: Range, claimIds: ClaimRefs }).nullable(), // null → "Unknown"
    costs: z.array(z.object({ text: z.string(), claimIds: ClaimRefs })),
    // computed: level, levelCeiling, handsOnEffort (Range), confidence, lastChecked, startHereStepId
    computed: z.object({
      level: z.number().int().min(0).max(5).nullable(),
      levelCeiling: z.number().int().min(0).max(5).nullable(),
      handsOnEffort: Range,
      confidence: z.enum(["high", "medium", "low"]),
      lastChecked: z.string(),
      startHereStepId: z.string().nullable(),
    }).optional(),
  }),

  preApprovalLimits: z.array(z.object({ text: z.string(), claimIds: ClaimRefs })),

  steps: z.array(z.object({
    id: z.string(),
    phase: z.enum(["prepare", "create", "configure", "connect_composio", "test", "submit", "wait", "launch"]),
    title: z.string(),
    detail: z.string(),
    owner: StepOwner,
    takeoverPoints: z.array(z.string()),  // e.g. "2FA", "accept ToS" — where Setup agent stops
    estMinutes: z.number().nullable(),
    url: z.string().url().optional(),
    blockers: z.array(z.object({ text: z.string(), workaround: z.string() })),
    claimIds: ClaimRefs,
  })),

  whileYouWait: z.array(z.object({ text: z.string(), claimIds: ClaimRefs })),
  gotchas: z.array(z.object({ text: z.string(), severity: z.enum(["info", "warn", "blocker"]), claimIds: ClaimRefs })),
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
    unansweredQuestions: z.array(z.string()).optional(), // research question ids hit by deadline
  }),
});
export type Guide = z.infer<typeof Guide>;

export const JobEvent = z.object({
  id: z.number(),
  ts: z.string(),
  type: z.enum(["stage_started", "stage_done", "probe", "search", "fetch", "finding", "warning", "candidates", "guide_ready", "error"]),
  payload: z.record(z.any()),
});
```

Notes:
- The synthesis tool schema omits every computed field. `rubric.ts` fills them.
- Validation rule: every row must contain each `GateKey` exactly once. Zod refine enforces it.

---

## 8. Architecture

```
Browser (Next.js)
  │ POST /api/generate {query, passcode}
  ▼
Route ── job row ── waitUntil(runPipeline(jobId)) ── {jobId} | {candidates[]} | {existingSlug}
  │ GET /api/jobs/:id?after=N   (poll 1s)
  ▼
Pipeline — writes job_events
  0 Resolve ─► 1 Probes ─► 2 Composio lookup (if Toolkit) ─► 3 Research agent
    ─► 4 Quote check ─► 5 Synthesize ─► 6 Verify ─► 7 Rubric + persist Guide version ─► guide_ready
  ▼
Neon Postgres (products, guide_versions, jobs, job_events)
```

**Stack:**
- Next.js (App Router, TypeScript), Tailwind, shadcn/ui.
- Neon Postgres via Drizzle.
- `@anthropic-ai/sdk`.
- Vercel with Fluid compute.

**Long runs:**
- `maxDuration = 300` plus `waitUntil`.
- The pipeline has a hard 240s deadline. If research isn't done, it synthesizes from what it has, marks confidence low, and lists unanswered questions.
- Fallback host: Railway.

**Polling, not SSE:** it survives restarts and refreshes, and is trivial to build.

---

## 9. Pipeline

### Stage 0: Resolve (`lib/agent/resolve.ts`)
1. If the input is a URL, extract the registrable domain.
2. Search Composio Toolkits (`GET /api/v3.1/toolkits?search=`). A clear match sets `toolkitSlug`.
3. If there's no match, make one small Claude call with web_search. It returns `{productName, providerName, domain, devPortalUrl?, docsCandidates[]}`, or `{candidates[]}`.
4. If there are 2+ plausible candidates ("Box", "Monday", "Front"), emit a `candidates` event and the user picks. Never guess.
5. If nothing is found ("asdfgh"), return "Couldn't identify this app — try its website."
6. If a Guide version under 30 days old exists, return `existingSlug` with a Regenerate option.

### Stage 1: Probes (`lib/probes.ts`, plain fetch, 5s timeout each)
- Fetch `/.well-known/openid-configuration` and `/.well-known/oauth-authorization-server` on the apex and on the `api.`, `auth.`, `login.`, `accounts.` and `oauth.` subdomains.
- Record the endpoints, `registration_endpoint` (→ dynamic client registration), `code_challenge_methods_supported` (→ PKCE) and `scopes_supported`.
- Check whether the dev portal and docs are reachable or behind a login wall.
- Each result becomes a **Tested** Claim, and each probe emits a `probe` event.

### Stage 2: Composio lookup (`lib/composio.ts`, only if `toolkitSlug`)
- `GET /api/v3.1/toolkits/<slug>` → `auth_schemes`, `composio_managed_auth_schemes`, `auth_guide_url`.
- These facts are **Documented**.
- No Toolkit means `composio: null`, and the steps end at "OAuth app ready".

### Stage 3: Research agent (`lib/agent/research.ts`)
- **Model:** `MODEL_RESEARCH`.
- **Server tools:** web_search (`max_uses` 8) and web_fetch (`max_uses` 12). Check the current tool versions and beta headers.
- **Client tool:** `record_finding(question_id, finding, url, quote, official, page_date?)`.
- **Loop:**
  - Handle `tool_use` by saving the finding and returning `"ok"`.
  - On `pause_turn`, re-send the conversation.
  - Emit `search` and `fetch` events from `server_tool_use` blocks.
- web_fetch only fetches URLs already in the conversation, so pass `docsCandidates` in the prompt.
- **Questions** (fixed ids):

  | Id | Question |
  |---|---|
  | `q_oauth` | OAuth for third-party apps? Flows, PKCE, discovery? |
  | `q_register` | Where to register; prerequisites (account, paid plan, company page)? |
  | `q_redirect` | HTTPS-only, localhost, exact match, count limits, domain ownership? |
  | `q_scopes` | Main agent scopes; which trigger review or verification? |
  | `q_gates` | **Answer every Gate question for each scope group: yes/no/not found, each with a quote.** |
  | `q_distribution` | Dev vs. public modes; Pre-approval limits (users, installs, token expiry, rate limits)? |
  | `q_review` | Review artifacts, stated durations, fees, renewal? |
  | `q_listing` | Is listing needed for production, or only discovery? Does it change limits? |
  | `q_ratelimits` | Limits that differ by app status? |
  | `q_changes` | Changes in the last ~18 months? |
  | `q_gotchas` | Community pitfalls (Reported)? |

- **Budget:** ~90–150s and ≤ $1 per Guide. Measure both.

### Stage 4: Quote check (`lib/agent/quotecheck.ts`)
- Normalize text, then require an exact substring or a fuzzy ratio ≥ 0.9.
- Use the web_fetch content if available; otherwise fetch the page ourselves.
- An unreadable page gets `quoteMatched: false` with the note "not machine-checkable".
- An unmatched quote on a Verdict-relevant finding makes the Claim Unverified.

### Stage 5: Synthesize (`lib/agent/synthesize.ts`)
- **Model:** `MODEL_SYNTH`. Forced tool choice: `submit_guide`, with its schema generated from zod minus the computed fields.
- **Rules:**
  - Every fact cites Claim ids. No new facts.
  - Every Usage row answers every Gate question. If no finding settles a question, the answer is `unknown`, never `no`.
  - Keep Production access review, Scope verification and Listing review separate.
  - `approvalWait` is null unless a Claim states a duration.
  - Steps are concrete: portal, field names, exact callback URL.
  - **Owner:**
    - `you`: identity, legal, payment, 2FA, ToS, final submit.
    - `setup_agent_drafts`: justifications, privacy-policy checklist, demo script, field values.
    - `setup_agent`: navigation, form-filling, redirect URI checks, config validation.
    - Use the Takeover points from `evidence/` when they exist.
- Validate with zod. On failure, retry once with the errors.

### Stage 6: Verify (`lib/agent/verify.ts`)
- **Model:** `MODEL_VERIFY`, ~10 Claims per call.
- Each Claim gets a verdict: `supported | partial | unsupported | conflicting`.
- `unsupported` → the Claim becomes Unverified. `conflicting` → add the gotcha "Sources disagree".

### Stage 7: Rubric and persist
- Compute each row's level and ceiling, then for the Verdict: level and ceiling, effort (sum of `estMinutes` plus artifacts), confidence, last checked, and the Start here step (the first step where `owner == you`).
- Insert a Guide version and emit `guide_ready`.

### Failures
- **No OAuth:** an N/A Guide that lists alternatives.
- **Docs behind login:** say so and lower confidence.
- **Deadline hit:** synthesize partial results.
- **Every error:** an `error` event with a human message, and a retry button in the UI.

---

## 10. Prompts (`lib/agent/prompts.ts`), first drafts

**RESEARCH_SYSTEM**
> You are researching how a developer registers their own OAuth app with {product} ({provider}) and gets it to Production, meaning users outside their org can authorize at the volume they need. Answer every research question. For `q_gates`, answer each Gate question with an explicit finding: required, not required (quote the evidence), or not found (say where you looked). Never treat silence as "not required". Prefer official docs, policies and changelogs; use community sources only for gotchas (`official: false`). One `record_finding` per fact, with the exact URL and an exact quote under 40 words. Never estimate durations without a source. Note page dates. Keep Production access review, Scope verification and Listing review apart.

**SYNTH_SYSTEM**
> Turn the findings into a Guide via `submit_guide`. Use only the findings and cite Claim ids. Every Usage row answers every Gate question; use `unknown` when no finding settles it. Leave approvalWait null unless a Claim states a duration. Write for a developer who follows it alone and shares it: concrete portals, field names, URLs. Put uncertainty in `unknowns`. Never compute levels, effort or confidence.

**VERIFY_SYSTEM**
> For each Claim, does the quoted source support it? supported / partial / unsupported / conflicting. Be strict about numbers, durations, and "required" vs "optional". Give a one-sentence reason.

---

## 11. Data model (Drizzle)

```
products        (slug PK, product_name, provider_name, product_url, logo, toolkit_slug null,
                 composio_managed bool null, in_library bool, popularity int)
guide_versions  (id PK, slug FK, version int, origin 'curated'|'live', review_status 'reviewed'|'unreviewed',
                 level int null, level_ceiling int null, confidence text, data jsonb, created_at)
jobs            (id uuid PK, query, slug null, status 'queued'|'running'|'done'|'error',
                 started_at, finished_at, error, cost_usd numeric, duration_sec int)
job_events      (id serial PK, job_id FK, ts, type, payload jsonb)
```

**Shown version:** the latest `reviewed` version, otherwise the latest version. If there's a newer unreviewed version, show "A newer unreviewed run exists →".

Curated Guides live in `data/curated/*.json` and are seeded into `guide_versions`.

## 12. API routes

| Route | Purpose |
|---|---|
| `POST /api/generate` `{query, passcode}` | → `{jobId}` \| `{candidates[]}` \| `{existingSlug}`. Requires `DEMO_PASSCODE`. Limits: 5/hour per IP, `MAX_GENERATIONS_PER_HOUR` (30) globally. |
| `GET /api/jobs/:id?after=N` | → `{status, events[], slug?}` |
| `GET /api/guides/:slug` | Shown version as JSON (agent-readable) |
| `GET /api/guides/:slug/markdown` | Markdown export, including **Instructions for your Setup agent** |
| `GET /api/products?q=&level=&status=&managed=` | Directory listing |
| `POST /api/guides/:slug/regenerate` | Adds a new version (passcode, rate limit) |

Reading needs no passcode.

## 13. UI

**`/` — Directory**
- Search box: "Look up an app or paste its website".
- Filters: Runway level, Managed auth available, status.
- Cards: logo, name, level badge, "~X h work · ~Y wait", status chip, and Generate for ungenerated products.

**`/generate?q=` — Live run**
- Passcode prompt.
- Stage checklist: Resolve, Probe, Research, Check quotes, Write, Verify, Score.
- Event stream, plus elapsed time and the number of sources read.
- A candidate picker when the name is ambiguous.
- Redirects to the Guide when done.

**`/guides/[slug]` — Guide**
1. **Verdict card:** level badge (or range) and label, one-liner, **Start here**, effort, wait (or "Unknown"), Cost badge, confidence, last checked, Reviewed/Unreviewed chip, Managed-auth chip.
2. **Usage toggle:** switches rows and updates the Verdict, e.g. Gmail "Sign in" R0 ↔ "Read & send" R4.
3. **Why this level:** the Gate answers table (yes/no/unknown with Claim chips), which is the explainability from ADR-0001.
4. **Before you start:** requirements and Review artifacts.
5. **Steps:** a timeline by phase. Each step has an owner chip (🤖 Setup agent / 🤝 Agent drafts, you confirm / 👤 You), Takeover points, an estimate, a link, blockers with workarounds, and a tick box saved in localStorage (try/catch).
6. While you wait.
7. Gotchas, by severity.
8. What we couldn't verify.
9. Evidence: a Claims table with label, sources (quote on hover), verifier status and attempt screenshots.
10. Actions: Copy link, Copy as Markdown, Copy checklist, Print, Report outdated info.

**`/verification`:** the rendered `verification/LOG.md` plus summary stats.

**Design:** docs-like. Level colors run green (R0) to red (R5), with ranges striped. Mobile-friendly. The verdict should be readable in five seconds.

**Markdown export: Instructions for your Setup agent block** (~20 lines)
- Steps the Setup agent may do.
- The exact callback URL.
- Field values to pre-fill.
- An explicit STOP at each Takeover point: "hand back to the human for: login, 2FA, ToS, final submit".

## 14. Repo structure

```
app/  page.tsx  generate/page.tsx  guides/[slug]/page.tsx  verification/page.tsx
      api/generate  api/jobs/[id]  api/guides/[slug]  api/guides/[slug]/markdown  api/products
lib/  schema.ts rubric.ts rubric.test.ts db.ts dbschema.ts composio.ts probes.ts markdown.ts ratelimit.ts
      agent/ resolve.ts research.ts quotecheck.ts synthesize.ts verify.ts pipeline.ts prompts.ts
components/ VerdictCard LevelBadge UsageToggle GateTable StepList OwnerChip EvidenceTable EventLog
            RequirementList GotchaList ProductCard CandidatePicker
data/ library.json  curated/{github,slack,gmail,notion}.json
evidence/<slug>/ attempt.md + screenshots (secrets blurred)
verification/ LOG.md  <slug>/draft-v1.json  <slug>/final.json
scripts/ seed-library.ts load-curated.ts check-quotes.ts
docs/adr/  GLOSSARY.md  BRIEF.md  README.md  PLAN.md  .env.example
```

## 15. Library and curated set

**`scripts/seed-library.ts`:**
- Page through `/api/v3.1/toolkits` (`sort_by=usage`).
- Keep OAuth, non-deprecated Toolkits and take the top 100.
- Write `data/library.json`.
- If the API is unreachable, fall back to a hand-written list.

**Curated set** (each goes pipeline draft → hand review → Reviewed version):

| Product | Expected level of default row | Why |
|---|---|---|
| GitHub | R0 | Baseline |
| Slack | R2 (read history: non-Marketplace Blocking limit) | Self-serve OAuth, but rate limits gate agents |
| Gmail | R4 (restricted scopes → CASA) | Level depends on the Usage row |
| Notion | R0–R1 | Listing review vs. production confusion |

Everything else in the directory shows "Not generated yet → Generate".

---

## 16. Milestones (~7.3h)

| # | Milestone | Time | Acceptance criteria |
|---|---|---|---|
| M0 | Scaffold: Next.js, Tailwind, shadcn, Drizzle, Neon, env | 0:15 | `pnpm dev` runs; DB connected; `.env.example` committed; `.env*` gitignored |
| M1 | **Setup agent attempts** (§17): GitHub, Slack, Google | 1:00 | `evidence/<slug>/attempt.md` × 3 with timings, screenshots, Takeover points, and the review screen's demands |
| M2 | `schema.ts` + `rubric.ts` + tests + hand-written GitHub JSON | 0:30 | Zod validates. Rubric tests: GitHub → R0; Gmail read → R4; one unknown gate → range + low confidence; Slack history Blocking limit → R2 |
| M3a | Resolve (Composio, then LLM fallback) + probes + Composio lookup | 0:40 | "Box" → candidates; "asdfgh" → not found; a non-Toolkit product resolves; `probes("slack.com")` returns a result or a clear "not found" |
| M3b | Research loop with events | 0:50 | A Slack run logs ≥ 6 findings with URLs and quotes, answering every Gate question, within 150s |
| M3c | Quote check, synthesize, verify, rubric, persist | 0:50 | A Notion run ends with a zod-valid Guide version; levels and confidence computed; ≥ 1 unknown listed |
| M4 | UI: directory, live run, Guide page, Markdown with Setup agent block, /verification | 1:30 | A first-time user can search → watch → read → copy the Markdown with no explanation |
| M5 | 4 curated Guides (draft-v1 → review) + 2 live runs + **verification log** | 1:00 | `LOG.md` covers ≥ 30 Claims across ≥ 4 Guides with outcome codes, and ≥ 1 prompt change re-run and shown fixed |
| M6 | Deploy, README, stress tests (§20) | 0:45 | Public URL works on a fresh browser; 5 unfamiliar apps generate without crashing; README complete |

**Cut order if behind:**
1. Notion curated (keep it as a live run)
2. Probes beyond OIDC/RFC 8414
3. Tick boxes
4. The /verification page (link LOG.md instead)

**Never cut:** the verification log, Evidence labels, Gate answers.

---

## 17. Setup agent attempt protocol

For GitHub, Slack and Google, with the Setup agent (the built-in browser or Claude in Chrome) driving and you taking over only at Takeover points:

1. Start a timer and screenshot every screen.
2. The Setup agent opens the portal and creates the OAuth app with the Composio callback URL from the dashboard. Record which variant it is (`/api/v3/` or `/api/v3.1/`).
3. **You** step in for login, 2FA, captcha, ToS and secret reveal. Log each one as a Takeover point with its cause.
4. Create a Composio Auth config: Authentication management → Create Auth Config → Toolkit → OAuth2 → "Use your own developer credentials".
5. Connect your account and run one tool call. Confirm the consent screen shows *your* app name.
6. Go as far as the review, verification or publish screen **without submitting**. Capture what it asks for and any limits it shows.
7. Clean up: delete the apps or rotate their secrets. Blur secrets in screenshots.

**`evidence/<slug>/attempt.md` template:**
```md
# <Product> — setup attempt (<date>)
- Driver: Setup agent (<tool>) + me at Takeover points
- Total hands-on time: __ min (portal → working connection)
- Steps (time, who):
  1. … (__ min, agent|me) — 01.png
- Takeover points: <step> — <why: login|2FA|captcha|ToS|secret|judgment>
- Composio callback URL used: …
- Consent screen showed my app name: yes/no
- Pre-approval limits observed: …
- Review/verification screen asks for: …
- Surprises vs docs: …
- Claims supported: …
```

## 18. Verification protocol and log

**Sample:**
- 4 curated Guides.
- 2 live runs: one well-known product, one unfamiliar.
- 6–8 high-impact Claims per Guide: Gate answers, wait, caps, artifacts, redirect rules, top gotcha, Managed auth status.

**Method:**
- Open each source.
- Compare it with the attempt.
- Look for a second official source.
- Keep `draft-v1.json` and `final.json` for each Guide, and log every change.

**`verification/LOG.md` template:**
```md
# Verification log
Summary: N Claims across M Guides — ✅ X confirmed · ✏️ Y corrected · ⚠️ Z partial · ❓ W couldn't verify
Error patterns: …
Prompt/pipeline changes: … (re-run result)

| Guide | Claim | Agent said (v1) | Reality (source / attempt) | Outcome | Evidence |
|---|---|---|---|---|---|
```

The improvement loop is the main proof of "thoughtful use of agents": find a pattern, change the prompt, re-run, and show it's fixed.

## 19. Seed facts and known conflicts (confirm during attempts)

**Composio**
- You need your own OAuth app for:
  - Toolkits without Managed auth;
  - your brand on the consent screen;
  - custom scopes;
  - a dedicated quota;
  - polling triggers faster than 15 minutes.

  Sources: docs.composio.dev/toolkits/managed-auth and /docs/using-custom-auth-configuration.
- Switching to a custom Auth config doesn't migrate existing connections; users must re-authenticate. This is a gotcha in every Guide that has a Toolkit.
- A callback can be routed through your own domain with a 302 to Composio's callback.
- Toolkits API: `/api/v3.1/toolkits`, `/api/v3.1/toolkits/<slug>`.

**Google**
- **Testing status:** ≤ 100 test users. Authorizations expire after 7 days unless only sign-in scopes are requested (support.google.com/cloud/answer/15549945).
- **Unverified production apps** with sensitive or restricted scopes get a warning screen and a lifetime cap of 100 users.
- **Restricted scopes** need verification plus an annual CASA assessment. The Health API page says 2–3 weeks (tier 2) and 4–6 weeks (tier 3), with fees of ~$500–4.5k. Confirm this for Gmail.
- **Max 10 authorized domains.** Hypothesis: owning the redirect domain matters if your redirect is on `backend.composio.dev`, and a custom redirect domain may be the workaround.
- One Google Cloud project is shared across Gmail, Drive and Calendar, so verification covers all their scopes. This is a gotcha.

**Slack**
- **Since 2025-05-29**, non-Marketplace commercial apps get `conversations.history`/`replies` at 1 req/min and 15 objects per call. Internal apps are unaffected. This is a Blocking limit for "read history".
- **Conflict:** the changelog gives two dates for when existing installs are affected (2025-09-02 vs. 2026-03-03).
- **Marketplace minimum workspaces:** 10 → 5? Verify the current number.

**Notion**
- **Conflict:** older docs say public integrations need a security review. Current docs say the review is for Marketplace listing only.
- Installation scope is fixed at creation; choose "Any workspace" if you might ever list.

**Prior art**
- Composio's oauth2-guides cover the click-path only.
- Nango's "Access requirements" grid is often "❓".
- We add evidence, levels, timing, and live generation.

## 20. Stress tests

- **Well-known:** HubSpot, Salesforce, Zoom, Dropbox, Jira, Shopify, Spotify, X.
- **Long-tail:** Pipedrive, Xero, Calendly, Strava, Typeform, ClickUp, Productboard.
- **Not a Composio Toolkit:** pick 2 → a Guide with `composio: null`.
- **API-key only:** Tavily, PostHog → N/A with alternatives.
- **Ambiguous:** Box, Monday, Front → the candidate picker.
- **URL input:** `https://linear.app`, `notion.so`.
- **Nonsense:** "asdfgh" → a graceful "not found".
- **Record** median and p90 run time and the cost per Guide. Put them in the README.

## 21. Deployment, env, security

```
ANTHROPIC_API_KEY=
COMPOSIO_API_KEY=            # server-side only
DATABASE_URL=
MODEL_RESEARCH=claude-sonnet-5-5
MODEL_SYNTH=claude-sonnet-5-5
MODEL_VERIFY=claude-haiku-5-5
MAX_GENERATIONS_PER_HOUR=30
DEMO_PASSCODE=               # required for generate/regenerate; share with reviewers
```

- Keys stay server-side only.
- No secrets in the repo, screenshots or seed data.
- Rotate the test-app secrets after the attempts.

## 22. README outline

1. **What this is:** the live link and the passcode note.
2. **Try it:** "Open Gmail, toggle the Usage row; then generate a Guide for any app."
3. **Setup:** `pnpm i`, env, `pnpm db:push`, `pnpm seed`, `pnpm dev`.
4. **How it works:** the pipeline plus a line per stage.
5. **Key decisions:** §3 condensed, with ADR links.
6. **Method:** Runway level rubric, Gate questions, Evidence labels. This replaces a /method page.
7. **What was tested:**
   - Setup agent attempts and their Takeover points;
   - a per-Guide table of Tested / Documented / Reported / Unverified counts.
8. **Verification results:** stats, error patterns, prompt changes, and a link to LOG.md.
9. **Limitations:**
   - Durations are provider-stated.
   - No completed approvals.
   - JS-rendered docs can't always be checked.
   - LLM errors are possible.
   - Guides go stale (shown as "last checked").
10. **Next steps:** §25.

## 23. Demo script (~5 min)

1. **(20s) Problem:** "An hour or weeks? Today you can't tell until you're in it."
2. **(60s) Gmail:** toggle Sign in R0 → Read & send R4. Show the Gate table ("why R4"), effort vs. wait vs. Cost, and While you wait.
3. **(40s) Slack:** self-serve OAuth, but the Blocking limit on reading history makes it R2.
4. **(30s) Evidence:** a Tested Claim from a Setup agent attempt, a Takeover point, and "couldn't verify".
5. **(90s) Live:** the reviewer submits an app; watch the stages, then the Guide. If its Gate answers are unknown, show the range.
6. **(40s) Verification log:** the error, the correction, and the prompt change.
7. **(20s) Share:** copy the Markdown with the Setup agent block and paste it into Claude Code.

## 24. Risks

| Risk | Mitigation |
|---|---|
| Live run slow or fails | 240s deadline with partial output; existing-Guide cache |
| Hallucinated facts | Quotes required; deterministic quote check; verifier; Unverified label; levels computed in code |
| Missing facts read as "easy" | Gate questions answered yes/no/unknown; unknowns show as a range with low confidence |
| Stale or conflicting sources | Page dates; `q_changes`; conflict gotchas; last checked |
| JS-rendered docs | "Not machine-checkable"; lower confidence |
| Cost runaway | `max_uses`, per-IP and global limits, passcode |
| Secrets leak | Env-only keys, gitignore, blurred screenshots, rotation |

## 25. Future work

- **Usage rows from Composio Toolkit actions**, grouped by required scopes.
- **Provider-level Claim reuse**, e.g. Gmail and Drive sharing Google verification facts.
- **Draft my submission:** justifications, privacy-policy checklist, demo script, form values.
- **Freshness:** weekly re-runs, diffs, and change alerts.
- **Observed timing data** from Composio customers.
- **Setup agent runs in the developer's own browser**, pausing at Takeover points.
- **Embed in the Composio dashboard** next to "Use your own developer credentials".
- **Community corrections**, and expanding to every OAuth Toolkit.
