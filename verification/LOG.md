# Verification log

Checked 2026-11-09. Each agent draft (`<slug>/draft-v1.json`) was compared, claim by claim, against the official pages. Every row below was read on the page itself, not taken from the agent's quote. Reviewed Guides are in `<slug>/final.json` (= `data/curated/<slug>.json`).

**Summary:** 61 Claims across 5 Guides (GitHub, Slack, Gmail, Notion, plus Composio facts shared by all) — ✅ 34 confirmed · ✏️ 16 corrected · ⚠️ 8 partial · ❓ 3 couldn't verify

**Hands-on:** one Setup agent attempt per Guide, 2026-11-10: [GitHub](../evidence/github/attempt.md), [Slack](../evidence/slack/attempt.md), [Notion](../evidence/notion/attempt.md), [Gmail](../evidence/gmail/attempt.md). They added 27 Tested Claims (t1–t6 or t1–t8 in each Guide); rows marked "tested" below come from them.

## Error patterns

| # | Pattern | Example |
|---|---|---|
| A | Marketplace/listing requirements counted as Production gates | Slack v1 = **R5**: Marketplace review, pen testing and scope review all set as Production gates. Reality: public distribution has no review; the real barrier is a rate limit (R2). |
| B | One-liner contradicts the Gate answers | Notion v1: "requires no special gates" while all 9 gates were unknown. |
| C | Official docs labeled Reported | `docs.slack.dev` vs `slack.com`, `developers.notion.com` vs `notion.so` didn't match the product domain. Notion v1: 2 of 12 Claims documented. |
| D | Off-topic sources | Gmail v1 cited IAP deprecations, Workforce Identity Federation and Nest error pages (9 Claims); Slack v1 cited Wikipedia. |
| E | Review durations from third-party blogs | Slack v1 wait "1–10 weeks" from slack.green; official: up to 10 business days + up to 10 weeks. |
| F | "Manual approval, no guaranteed outcome" read as any manual review | Gmail v2 (first run) = **R5** because Google reviews apps manually. |
| G | Invented scopes or rows | Notion v2 added a "Sign-in (openid profile)" row; Notion has no OIDC scopes. |

## Prompt and pipeline changes (re-run results)

| Fix | Change | Re-run (v1 → v2) |
|---|---|---|
| A | Synth prompt defines Production and says listing review/requirements aren't row gates; severe unlisted limits go in `blockingLimits` | Slack: R5 → R3–R5?, false gates 4 → 2, Blocking limit captured. **Partly fixed**: scope review still read as Production. Reviewed Guide: R2–R3?. |
| B | Synth prompt: oneLiner must agree with the gates | Notion v2 one-liner names only gates it settled "no". **Fixed.** |
| C | Sibling domains on mainstream TLDs count as official (`lib/agent/research.ts`) | Documented Claims: Notion 2 → 15, Slack 6 → 17. **Fixed.** |
| D | Extract prompt: only this product's API and OAuth apps | Off-topic Claims: Gmail 9 → 3, Notion 3 → 1, Slack 1 → 0. **Mostly fixed.** |
| E | `approvalWait` kept only when a Documented or Tested Claim backs it (code) | Slack v2 wait from the blog dropped. **Fixed.** |
| F | Gate question reworded ("at the provider's discretion with no published criteria") and gates made per row | Gmail: restricted row R4, manual approval = no; sign-in row no longer inherits Gmail's review. **Fixed.** |
| — | Hand-verified Composio facts moved into code (callback URL, no migration) | Every Toolkit Guide now carries the exact v3 callback and the migration gotcha. |
| — | Bug: `applies_to` missing on `not_found` answers failed validation | Made optional, defaults to "both". |

**Still open:** G (invented rows) and default-row choice (Gmail v2 picked a broad "read & send" row with unsettled gates). Generated Guides stay Unreviewed.

## Claims

| Guide | Claim | Agent said (v1) | Reality (source) | Outcome | Evidence |
|---|---|---|---|---|---|
| Slack | Production access review | Yes, Marketplace review gates production | No review step for public distribution; review is for Marketplace listing | ✏️ | docs.slack.dev/app-management/distribution |
| Slack | Manual approval, uncertain | Yes | Marketplace review has published guidelines; listing only | ✏️ | docs.slack.dev/slack-marketplace/slack-marketplace-review-guide |
| Slack | Security assessment | Yes (pen testing) | Pen testing "at Slack's discretion" during Marketplace review; not a third-party assessment | ✏️ | slack.com/blog/developers/slack-marketplace-review-process |
| Slack | Scope review | Yes, `:history`/`admin.` trigger review | Enhanced review is real (also `files:read`, `canvases:read`, `search:read.*`…) but only for Marketplace | ⚠️ | slack-marketplace-app-guidelines-and-requirements |
| Slack | Review duration | "Up to 10 days first pass, 10 weeks functional" (blog) | Up to 10 **business** days preliminary, up to 10 weeks new / 6 weeks resubmissions | ✏️ | slack-marketplace-review-guide |
| Slack | Non-Marketplace rate limit | 1 req/min, 15 objects (third-party source) | Confirmed; also applies to new installs of existing apps | ✅ | docs.slack.dev/changelog/2025/05/29/… |
| Slack | Internal apps | Not stated | Internal customer-built apps not affected | ✅ | same changelog |
| Slack | Existing installs (seed: 2025-09-02 vs 2026-03-03) | — | Existing installs are not affected; neither date is on the page | ✏️ | same changelog |
| Slack | Marketplace minimum installs (seed: 10 or 5?) | Not found | 10 active workspaces (guidelines also mention < 20 MAU) | ✅ | slack-marketplace-review-guide |
| Slack | HTTPS redirect | Not stated | `redirect_uri` must use HTTPS, no `#` | ✅ | docs.slack.dev/authentication/installing-with-oauth |
| Slack | Redirect URI behavior | Docs cited but labeled Reported | Official; evidence label wrong | ✏️ | installing-with-oauth |
| Slack | Redirect mismatch returns 400 | Cited a Nango post about `invalid_team` | Quote is about a different error | ⚠️ | nango.dev |
| Slack | PKCE | Not found | `pkce_enabled` app setting, can't be turned off; client types not documented | ⚠️ | docs.slack.dev/reference/app-manifest |
| Slack | Privacy-policy criticism | Gotcha from Wikipedia | Off-topic, removed | ✏️ | — |
| Slack | Public distribution without review | Seed: business/domain verification unknown | Activated instantly after a self-service checklist; no verification of any kind (tested) | ✅ | evidence/slack/attempt.md |
| Slack | Redirect matching | Not stated | **Partial match**: sub-path of the registered URL accepted, other domains rejected (tested) | ✅ | evidence/slack/attempt.md |
| Slack | Runtime scopes | — | Scopes not configured on the app still appear on consent when requested (tested) | ✅ | evidence/slack/attempt.md |
| Gmail | Security assessment | Annual assessment for server access | Confirmed for restricted scopes ("undergo", not "pass") | ✅ | …/restricted-scope-verification |
| Gmail | gmail.send classification | Triggers verification | Sensitive (not restricted); readonly/modify/compose restricted | ✅ | developers.google.com/workspace/gmail/api/auth/scopes |
| Gmail | Restricted verification time | "Several weeks" for sensitive | "Several weeks" is restricted; sensitive pages say up to 10 days | ⚠️ | …/sensitive-scope-verification |
| Gmail | Brand verification | 2–3 business days | Manual review 2–3 days; automated check takes minutes | ⚠️ | …/brand-verification |
| Gmail | Scope verification for restricted | Required | Confirmed | ✅ | …/restricted-scope-verification |
| Gmail | Domain verification | Required | Authorized domains verified in Search Console, incl. redirect URI domains | ✅ | …/brand-verification |
| Gmail | Manual approval, uncertain | "Request a manual review" read as discretionary | That's an appeal path for automated checks | ✏️ | …/restricted-scope-verification |
| Gmail | Demo video | From a Roblox forum post | Required by Google (unlisted YouTube); source replaced | ✏️ | …/sensitive-scope-verification |
| Gmail | Testing limits (seed) | — | 100 test users; grants expire in 7 days except name/email/profile scopes | ✅ | support.google.com/cloud/answer/15549945 |
| Gmail | Unverified cap (seed) | — | Warning screen + 100-user lifetime cap | ✅ | support.google.com/cloud/answer/15549945 |
| Gmail | CASA fees (seed: ~$500–4.5k) | — | Not published by Google or the App Defense Alliance | ❓ | appdefensealliance.dev/casa |
| Gmail | Authorized domain cap (seed: 10) | — | Not stated on the pages read | ❓ | …/brand-verification |
| Gmail | IAP OAuth Admin API deprecation | Listed as a change | Off-topic (Identity-Aware Proxy), removed | ✏️ | — |
| Gmail | OAuth client creation | Workforce Identity Federation docs | Off-topic product, removed | ✏️ | — |
| Gmail | Redirect mismatch | Nest Device Access error docs | Off-topic source, removed | ✏️ | — |
| Gmail | Redirect domain blocks verification | Our inference | composio.dev is added to Authorized domains automatically when you register Composio's callback (tested); verifying it is impossible | ✅ | evidence/gmail/attempt.md |
| Gmail | Testing mode access | Seed: 100 test users | Gmail scopes 403 for non-test users, **including the project owner**; test users get the unverified warning (tested) | ✅ | evidence/gmail/attempt.md |
| Gmail | Consent branding | — | Unverified, unbranded app: Google says "Sign in to composio.dev", not the app name (tested) | ✅ | evidence/gmail/attempt.md |
| Notion | One-liner | "Requires no special gates" with all gates unknown | Contradicted its own gates | ✏️ | — |
| Notion | Review before production (seed conflict) | Not found | No review; Notion's security review is only for Marketplace listing | ✅ | developers.notion.com/guides/connections-and-tokens/public-integrations/overview |
| Notion | Rate limit | ~180/min (Reddit) | 180/min **per connection**; 600/min on Business/Enterprise; separate workspace limit | ⚠️ | developers.notion.com/reference/request-limits |
| Notion | Per-connection + per-workspace limits | Labeled Reported | Official; label wrong | ✏️ | request-limits |
| Notion | Register via developer portal | Labeled Reported | Official; confirmed | ✅ | developers.notion.com/guides/authorization/overview |
| Notion | Required fields | (v2) company, website, privacy policy, terms, support email | Only name, workspace, redirect URIs, installation scope, capabilities | ✏️ | public-integrations/overview |
| Notion | Installation scope fixed | Not found | Confirmed: set at creation, can't change | ✅ | public-integrations/overview |
| Notion | Fresh tokens per authorization | Labeled Unverified | Confirmed (changelog, 2026-06-08) | ✅ | developers.notion.com/page/changelog |
| Notion | Admin of workspace needed | Third-party (Apideck) | Not stated in Notion docs | ❓ | — |
| Notion | Redirect exact match | Third-party (hexdocs) | Not stated by Notion | ⚠️ | authorization/overview |
| Notion | PKCE | Not found | Not documented; token request uses HTTP Basic | ✅ | authorization/overview |
| Notion | No review for public connections | Documented only | Created instantly with name, auth type, install scope and redirect URI; no review (tested) | ✅ | evidence/notion/attempt.md |
| Notion | Redirect exact match | Not stated by Notion | Sub-path rejected (tested); page lists HTTPS, no fragments/wildcards/public IPs | ✅ | evidence/notion/attempt.md |
| Notion | Consent screen | — | Shows "(backend.composio.dev)" and "Notion does not review third party connections" (tested) | ✅ | evidence/notion/attempt.md |
| Composio | Callback URL (v3 or v3.1?) | Unknown | `https://backend.composio.dev/api/v3/toolkits/auth/callback` | ✅ | docs.composio.dev/docs/authentication/white-labeling-authentication |
| Composio | Polling minimum (seed: 15 min) | — | Managed auth enforces a **2-minute** minimum | ✏️ | docs.composio.dev/docs/authentication/custom-app-vs-managed-app |
| Composio | Why own app | — | Branding, custom scopes, own quota, faster polling, Toolkits without managed auth | ✅ | custom-app-vs-managed-app |
| Composio | Migration of existing connections | Unknown | Not migrated; users reconnect **or** you import credentials where supported | ⚠️ | white-labeling-authentication |
| Composio | Own callback domain | Seed hypothesis | Allowed where the provider supports it; must 302 to Composio's callback | ✅ | white-labeling-authentication |
| GitHub | Callback URLs | Up to 10 | Confirmed | ✅ | docs.github.com/…/creating-an-oauth-app |
| GitHub | PKCE | S256 only | Confirmed; `plain` rejected | ✅ | docs.github.com/…/authorizing-oauth-apps |
| GitHub | Org access restrictions | On by default for new orgs | Confirmed | ✅ | docs.github.com/…/about-oauth-app-access-restrictions |
| GitHub | OAuth apps per owner | 100 | Confirmed | ✅ | creating-an-oauth-app |
| GitHub | No review | No review | No review step described in docs; **the hands-on attempt registered instantly with no review** | ✅ | evidence/github/attempt.md |
| GitHub | Redirect exact match | Not stated | Sub-path of a registered URI rejected (tested) | ✅ | evidence/github/attempt.md |
| GitHub | Consent screen redirect domain | — | Shows "Authorizing will redirect to https://backend.composio.dev" (tested; new gotcha) | ✅ | evidence/github/attempt.md |

## Levels: draft vs reviewed

| Guide | v1 | v2 | Reviewed |
|---|---|---|---|
| GitHub | (hand-written) R1 | — | R1 |
| Slack | R5 | R3–R5? | R2 (R2–R3? before the hands-on attempt) |
| Gmail | R4–R5? | R5 (first run) → R4 restricted row | R4 |
| Notion | R0–R5? | R1–R5? | R0 |
